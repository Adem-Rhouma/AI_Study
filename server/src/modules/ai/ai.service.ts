import type Database from 'better-sqlite3';
import { config } from '../../config.js';
import { ApiError } from '../../lib/http.js';
import { getPreferences } from '../auth/auth.repo.js';
import {
  appendMessage,
  createConversation,
  getConversation,
  groundingFor,
  listMessages,
  recordUsage,
  resolveContext,
  resolveProvider,
  touchConversation,
  usageTotals,
  type AiContextType,
  type ConversationRow,
  type MessageRow,
  type ResolvedProvider,
  type UsageTotals
} from './ai.repo.js';
import { buildMessages } from './prompts.js';
import { completeChat, ProviderError, type ChatMessage } from './providers.js';

export const NOT_CONFIGURED_NOTE =
  'The study assistant is off until a provider is configured. Set AI_PROVIDER, AI_MODEL and AI_API_KEY in the server environment, or enable a provider in the admin console. Every other part of AI Mastery works without it.';

export type AssistantStatus = {
  configured: boolean;
  enabledForUser: boolean;
  provider: { name: string; adapter: string; model: string; source: ResolvedProvider['source'] } | null;
  note: string;
  rateLimitPerMinute: number;
  usage: UsageTotals | null;
};

function describeProvider(provider: ResolvedProvider | null) {
  if (!provider) return null;
  return {
    name: provider.name,
    adapter: provider.settings.adapter,
    model: provider.settings.model,
    source: provider.source
  };
}

export function assistantStatus(db: Database.Database, userId: number | null): AssistantStatus {
  const provider = resolveProvider(db);
  const preferences = userId ? getPreferences(db, userId) : null;
  return {
    configured: provider !== null,
    // Anonymous visitors see the platform-level answer; a learner's own switch only gates their calls.
    enabledForUser: preferences ? preferences.ai_assistant_enabled === 1 : true,
    provider: describeProvider(provider),
    note: provider ? '' : NOT_CONFIGURED_NOTE,
    rateLimitPerMinute: config.rateLimit.aiPerMinute,
    usage: userId ? usageTotals(db, userId, 30) : null
  };
}

export type AskInput = {
  userId: number;
  question: string;
  conversationId?: number | undefined;
  context?: { kind: Exclude<AiContextType, 'general'>; slug: string } | undefined;
};

export type AskResult = {
  conversation: ConversationRow;
  message: MessageRow;
  providerName: string;
  latencyMs: number;
};

const TITLE_MAX = 60;

function titleFrom(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat;
}

/**
 * Resolves the thread the answer belongs to. An existing conversation keeps the curriculum entry
 * it was opened against; a new one adopts whatever the learner is reading.
 */
function openConversation(
  db: Database.Database,
  input: AskInput
): { conversation: ConversationRow; contextId: number | null } {
  if (input.conversationId !== undefined) {
    const existing = getConversation(db, input.userId, input.conversationId);
    if (!existing) throw ApiError.notFound('Conversation not found.');
    return { conversation: existing, contextId: existing.context_id };
  }
  let contextType: AiContextType = 'general';
  let contextId: number | null = null;
  if (input.context) {
    const target = resolveContext(db, input.context.kind, input.context.slug);
    if (!target) throw ApiError.notFound(`Unknown ${input.context.kind} "${input.context.slug}".`);
    contextType = input.context.kind;
    contextId = target.id;
  }
  const id = createConversation(db, { userId: input.userId, title: 'New conversation', contextType, contextId });
  const conversation = getConversation(db, input.userId, id);
  if (!conversation) throw new ApiError(500, 'internal_error', 'Conversation write did not persist.');
  return { conversation, contextId };
}

/** A failed turn stores no text; replaying an empty assistant row would confuse the provider. */
export function historyOf(messages: MessageRow[]): ChatMessage[] {
  return messages
    .filter((row) => row.content.trim() !== '')
    .map((row) => ({ role: row.role, content: row.content }));
}

function notConfigured(): ApiError {
  return new ApiError(503, 'ai_not_configured', NOT_CONFIGURED_NOTE);
}

/** The stored/kind text is for logs; the learner only ever sees the sentence above. */
function surfaceFailure(err: ProviderError): ApiError {
  switch (err.kind) {
    case 'auth':
      return new ApiError(503, 'ai_provider_auth', 'The configured provider rejected its credentials. An administrator needs to check the API key.', err.message);
    case 'rate_limited':
      return ApiError.tooMany('The provider is rate limiting us. Try again in a moment.', 30);
    case 'timeout':
      return new ApiError(504, 'ai_provider_timeout', 'The provider took too long to answer. Try again, or shorten the question.', err.message);
    case 'unreachable':
      return new ApiError(503, 'ai_provider_unreachable', 'The provider could not be reached. Check that its base URL is correct and reachable from the server.', err.message);
    default:
      return new ApiError(502, 'ai_provider_error', 'The provider returned an unusable response.', err.message);
  }
}

export async function ask(db: Database.Database, input: AskInput): Promise<AskResult> {
  if (getPreferences(db, input.userId).ai_assistant_enabled !== 1) {
    throw new ApiError(403, 'ai_disabled_for_user', 'The study assistant is switched off for your account. Turn it back on in Settings.');
  }
  const provider = resolveProvider(db);
  if (!provider) throw notConfigured();

  const { conversation, contextId } = openConversation(db, input);
  const grounding = contextId === null ? null : groundingFor(db, conversation.context_type, contextId);
  const messages = buildMessages({
    grounding,
    history: historyOf(listMessages(db, conversation.id, 40)),
    question: input.question
  });

  appendMessage(db, { conversationId: conversation.id, role: 'user', content: input.question });

  const startedAt = Date.now();
  try {
    const completion = await completeChat(provider.settings, messages);
    const latencyMs = Date.now() - startedAt;
    appendMessage(db, {
      conversationId: conversation.id,
      role: 'assistant',
      content: completion.text,
      providerId: provider.id,
      model: completion.model,
      tokensPrompt: completion.tokensPrompt,
      tokensCompletion: completion.tokensCompletion
    });
    touchConversation(db, conversation.id, titleFrom(input.question));
    recordUsage(db, {
      userId: input.userId,
      providerId: provider.id,
      purpose: 'assistant',
      model: completion.model,
      tokensPrompt: completion.tokensPrompt,
      tokensCompletion: completion.tokensCompletion,
      latencyMs,
      ok: true
    });
    return finished(db, input.userId, conversation.id, provider.name, latencyMs);
  } catch (err) {
    const failure = err instanceof ProviderError ? err : new ProviderError('bad_response', 'The provider returned an unusable response.');
    const latencyMs = Date.now() - startedAt;
    // The question stays in the thread marked as a failed turn, so history shows what was tried.
    appendMessage(db, {
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      providerId: provider.id,
      model: provider.settings.model,
      error: failure.message
    });
    recordUsage(db, {
      userId: input.userId,
      providerId: provider.id,
      purpose: 'assistant',
      model: provider.settings.model,
      tokensPrompt: 0,
      tokensCompletion: 0,
      latencyMs,
      ok: false
    });
    touchConversation(db, conversation.id, titleFrom(input.question));
    throw surfaceFailure(failure);
  }
}

/** Re-reads what was just written so the response uses the same projection as GET. */
function finished(db: Database.Database, userId: number, conversationId: number, providerName: string, latencyMs: number): AskResult {
  const conversation = getConversation(db, userId, conversationId);
  const message = listMessages(db, conversationId, 1)[0];
  if (!conversation || !message) throw new ApiError(500, 'internal_error', 'Conversation write did not persist.');
  return { conversation, message, providerName, latencyMs };
}
