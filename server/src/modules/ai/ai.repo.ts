import type Database from 'better-sqlite3';
import { z } from 'zod';
import { all, get, insert, run } from '../../db/sql.js';
import { nowIso, parseJsonArray } from '../../lib/domain.js';
import { config } from '../../config.js';
import { decryptSecret } from '../../lib/crypto.js';
import { PROVIDER_ADAPTERS, type ProviderAdapter, type ProviderSettings } from './providers.js';

export const AI_CONTEXT_TYPES = ['general', 'topic', 'lesson', 'exercise', 'path', 'course'] as const;
export type AiContextType = (typeof AI_CONTEXT_TYPES)[number];

export type ResolvedProvider = {
  /** null when the provider comes from the environment rather than an ai_providers row. */
  id: number | null;
  name: string;
  source: 'database' | 'env';
  settings: ProviderSettings;
};

type ProviderRecord = {
  id: number;
  name: string;
  adapter: string;
  base_url: string;
  model: string;
  api_key_ciphertext: string;
  temperature: number;
  max_tokens: number;
  timeout_ms: number;
};

function needsKey(adapter: ProviderAdapter): boolean {
  return adapter !== 'ollama';
}

function settingsFromRow(row: ProviderRecord): ProviderSettings | null {
  if (!PROVIDER_ADAPTERS.includes(row.adapter as ProviderAdapter)) return null;
  let apiKey = '';
  try {
    apiKey = row.api_key_ciphertext ? decryptSecret(row.api_key_ciphertext) : '';
  } catch {
    // The app secret changed or the column was edited by hand: this row is unusable, not fatal.
    console.warn('[ai] provider', row.name, 'has a key we cannot decrypt; skipping it');
    return null;
  }
  if (!apiKey && needsKey(row.adapter as ProviderAdapter)) {
    console.warn('[ai] provider', row.name, 'has no API key; skipping it');
    return null;
  }
  return {
    adapter: row.adapter as ProviderAdapter,
    baseUrl: row.base_url,
    model: row.model,
    apiKey,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    timeoutMs: row.timeout_ms
  };
}

function providerFromEnv(): ResolvedProvider | null {
  const { provider, baseUrl, apiKey, model } = config.ai;
  if (!config.ai.enabledByEnv || !PROVIDER_ADAPTERS.includes(provider as ProviderAdapter)) return null;
  const adapter = provider as ProviderAdapter;
  if (!apiKey && needsKey(adapter)) return null;
  if (model === '') return null;
  return {
    id: null,
    name: 'environment',
    source: 'env',
    settings: { adapter, baseUrl, model, apiKey, temperature: 0.3, maxTokens: 900, timeoutMs: 30_000 }
  };
}

/**
 * Enabled database rows win, in priority order; the environment is the fallback so a fresh
 * install with AI_PROVIDER set works before anyone opens an admin screen.
 */
export function resolveProvider(db: Database.Database): ResolvedProvider | null {
  const rows = all<ProviderRecord>(
    db,
    `SELECT id, name, adapter, base_url, model, api_key_ciphertext, temperature, max_tokens, timeout_ms
       FROM ai_providers WHERE is_enabled = 1 ORDER BY priority ASC, id ASC LIMIT 5`
  );
  for (const row of rows) {
    const settings = settingsFromRow(row);
    if (settings) return { id: Number(row.id), name: row.name, source: 'database', settings };
  }
  return providerFromEnv();
}

export type ConversationRow = {
  id: number;
  user_id: number;
  title: string;
  context_type: AiContextType;
  context_id: number | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: number;
  conversation_id: number;
  role: 'system' | 'user' | 'assistant';
  content: string;
  provider_id: number | null;
  model: string | null;
  tokens_prompt: number;
  tokens_completion: number;
  error: string | null;
  created_at: string;
};

export function createConversation(
  db: Database.Database,
  input: { userId: number; title: string; contextType: AiContextType; contextId: number | null }
): number {
  const at = nowIso();
  return insert(
    db,
    `INSERT INTO ai_conversations (user_id, title, context_type, context_id, created_at, updated_at)
     VALUES (@userId, @title, @contextType, @contextId, @at, @at)`,
    { userId: input.userId, title: input.title, contextType: input.contextType, contextId: input.contextId, at }
  );
}

export function listConversations(
  db: Database.Database,
  userId: number,
  filters: { limit: number; offset: number; contextType?: AiContextType; contextId?: number | null }
): { items: (ConversationRow & { messageCount: number })[]; total: number } {
  const clauses = ['c.user_id = @userId'];
  const params: Record<string, unknown> = { userId, limit: filters.limit, offset: filters.offset };
  if (filters.contextType) {
    clauses.push('c.context_type = @contextType');
    params.contextType = filters.contextType;
    if (filters.contextType === 'general') clauses.push('c.context_id IS NULL');
  }
  // 'general' threads have no entry to point at, so 0 is the honest filter value for them.
  if (filters.contextId !== undefined && filters.contextId !== null) {
    clauses.push('c.context_id = @contextId');
    params.contextId = filters.contextId;
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const items = all<ConversationRow & { message_count: number }>(
    db,
    `SELECT c.id, c.user_id, c.title, c.context_type, c.context_id, c.created_at, c.updated_at,
            (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS message_count
       FROM ai_conversations c ${where}
      ORDER BY c.updated_at DESC, c.id DESC LIMIT @limit OFFSET @offset`,
    params
  ).map(({ message_count, ...row }) => ({ ...row, messageCount: Number(message_count) }));
  const total = Number(get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM ai_conversations c ${where}`, params)?.c ?? 0);
  return { items, total };
}

/** Ownership is part of the lookup: a conversation belonging to someone else does not exist here. */
export function getConversation(db: Database.Database, userId: number, id: number): ConversationRow | null {
  return get<ConversationRow>(db, 'SELECT * FROM ai_conversations WHERE id = @id AND user_id = @userId', { id, userId }) ?? null;
}

export function touchConversation(db: Database.Database, id: number, title?: string): void {
  if (title === undefined) {
    run(db, 'UPDATE ai_conversations SET updated_at = @at WHERE id = @id', { id, at: nowIso() });
    return;
  }
  run(
    db,
    `UPDATE ai_conversations SET updated_at = @at,
            title = CASE WHEN title = 'New conversation' THEN @title ELSE title END
      WHERE id = @id`,
    { id, at: nowIso(), title }
  );
}

export function appendMessage(
  db: Database.Database,
  input: {
    conversationId: number;
    role: MessageRow['role'];
    content: string;
    providerId?: number | null;
    model?: string | null;
    tokensPrompt?: number;
    tokensCompletion?: number;
    error?: string | null;
  }
): number {
  return insert(
    db,
    `INSERT INTO ai_messages (conversation_id, role, content, provider_id, model, tokens_prompt, tokens_completion, error, created_at)
     VALUES (@conversationId, @role, @content, @providerId, @model, @tokensPrompt, @tokensCompletion, @error, @at)`,
    {
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      tokensPrompt: input.tokensPrompt ?? 0,
      tokensCompletion: input.tokensCompletion ?? 0,
      error: input.error ?? null,
      at: nowIso()
    }
  );
}

export function listMessages(db: Database.Database, conversationId: number, limit: number): MessageRow[] {
  return all<MessageRow>(
    db,
    `SELECT * FROM ai_messages WHERE conversation_id = @conversationId ORDER BY id DESC LIMIT @limit`,
    { conversationId, limit }
  ).reverse();
}

export function countMessages(db: Database.Database, conversationId: number): number {
  return Number(get<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM ai_messages WHERE conversation_id = @id', { id: conversationId })?.c ?? 0);
}

export function deleteConversation(db: Database.Database, userId: number, id: number): number {
  return run(db, 'DELETE FROM ai_conversations WHERE id = @id AND user_id = @userId', { id, userId }).changes;
}

export function recordUsage(
  db: Database.Database,
  input: {
    userId: number | null;
    providerId: number | null;
    purpose: string;
    model: string;
    tokensPrompt: number;
    tokensCompletion: number;
    latencyMs: number;
    ok: boolean;
  }
): void {
  insert(
    db,
    `INSERT INTO ai_usage (user_id, provider_id, purpose, model, tokens_prompt, tokens_completion, latency_ms, ok, created_at)
     VALUES (@userId, @providerId, @purpose, @model, @tokensPrompt, @tokensCompletion, @latencyMs, @ok, @at)`,
    {
      userId: input.userId,
      providerId: input.providerId,
      purpose: input.purpose,
      model: input.model,
      tokensPrompt: input.tokensPrompt,
      tokensCompletion: input.tokensCompletion,
      latencyMs: input.latencyMs,
      ok: input.ok ? 1 : 0,
      at: nowIso()
    }
  );
}

export type UsageTotals = { calls: number; failures: number; tokensPrompt: number; tokensCompletion: number };

export function usageTotals(db: Database.Database, userId: number, days: number): UsageTotals {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const row = get<{ calls: number; failures: number; prompt: number; completion: number }>(
    db,
    `SELECT COUNT(*) AS calls,
            SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures,
            SUM(tokens_prompt) AS prompt,
            SUM(tokens_completion) AS completion
       FROM ai_usage WHERE user_id = @userId AND created_at >= @since`,
    { userId, since }
  );
  return {
    calls: Number(row?.calls ?? 0),
    failures: Number(row?.failures ?? 0),
    tokensPrompt: Number(row?.prompt ?? 0),
    tokensCompletion: Number(row?.completion ?? 0)
  };
}

/** Reverse of resolveContext: which curriculum entry a conversation is about. */
export function describeContext(
  db: Database.Database,
  kind: AiContextType,
  id: number
): { slug: string; title: string } | null {
  if (kind === 'general') return null;
  const table = CONTEXT_TABLES[kind];
  const row = get<{ slug: string; title: string }>(
    db,
    `SELECT slug, ${table.titleColumn} AS title FROM ${table.table} WHERE id = @id`,
    { id }
  );
  return row ? { slug: row.slug, title: row.title } : null;
}

export type Grounding = { title: string; material: string };

const CONTEXT_TABLES: Record<Exclude<AiContextType, 'general'>, { table: string; titleColumn: string }> = {
  topic: { table: 'topics', titleColumn: 'name' },
  lesson: { table: 'lessons', titleColumn: 'title' },
  exercise: { table: 'exercises', titleColumn: 'title' },
  course: { table: 'courses', titleColumn: 'title' },
  path: { table: 'learning_paths', titleColumn: 'name' }
};

/** Clients address curriculum entries by slug everywhere else; conversations store the numeric id. */
export function resolveContext(
  db: Database.Database,
  kind: Exclude<AiContextType, 'general'>,
  slug: string
): { id: number; title: string } | null {
  const table = CONTEXT_TABLES[kind];
  const row = get<{ id: number; title: string }>(
    db,
    `SELECT id, ${table.titleColumn} AS title FROM ${table.table} WHERE slug = @slug`,
    { slug }
  );
  return row ? { id: Number(row.id), title: row.title } : null;
}

const MAX_GROUNDING_CHARS = 6000;

function clip(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_GROUNDING_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_GROUNDING_CHARS).trimEnd()}\n\n[excerpt — the entry is longer than what fits here]`;
}

function bullets(raw: unknown): string {
  const items = parseJsonArray(raw, z.string());
  return items.map((item) => `- ${item}`).join('\n');
}

function sections(parts: [string, string][]): string {
  return parts
    .filter(([, body]) => body.trim() !== '')
    .map(([heading, body]) => `${heading}\n${body}`)
    .join('\n\n');
}

/**
 * Reads the platform's own curriculum so the assistant explains what is actually taught here
 * instead of inventing a parallel version of it. Exercise answers are deliberately excluded:
 * the assistant gets the question, never the solution.
 */
export function groundingFor(
  db: Database.Database,
  contextType: AiContextType,
  contextId: number
): Grounding | null {
  if (contextType === 'topic') {
    const row = get<{
      name: string;
      difficulty: string;
      definition: string;
      explanation: string;
      misconceptions: string;
      open_problems: string | null;
    }>(db, 'SELECT name, difficulty, definition, explanation, misconceptions, open_problems FROM topics WHERE id = @id', {
      id: contextId
    });
    if (!row) return null;
    return {
      title: row.name,
      material: clip(
        sections([
          ['Topic', `${row.name} (${row.difficulty})`],
          ['Definition', row.definition],
          ['Explanation', row.explanation],
          ['Misconceptions to avoid', bullets(row.misconceptions)],
          ['Open problems', row.open_problems ?? '']
        ])
      )
    };
  }
  if (contextType === 'lesson') {
    const row = get<{ title: string; summary: string }>(
      db,
      'SELECT l.title, l.summary FROM lessons l WHERE l.id = @id',
      { id: contextId }
    );
    if (!row) return null;
    // Exercise and quiz blocks only reference an exercise by slug; their answers live elsewhere.
    const blocks = all<{ type: string; text: string }>(
      db,
      `SELECT type, text FROM lesson_blocks WHERE lesson_id = @id AND type NOT IN ('exercise','quiz')
        ORDER BY order_index ASC, id ASC`,
      { id: contextId }
    );
    const body = blocks.map((block) => (block.type === 'heading' ? `## ${block.text}` : block.text)).join('\n\n');
    return { title: row.title, material: clip(sections([['Lesson', row.title], ['Summary', row.summary], ['Content', body]])) };
  }
  if (contextType === 'exercise') {
    const row = get<{ title: string; kind: string; difficulty: string; prompt: string; context: string }>(
      db,
      'SELECT title, kind, difficulty, prompt, context FROM exercises WHERE id = @id',
      { id: contextId }
    );
    if (!row) return null;
    return {
      title: row.title,
      material: clip(
        sections([
          ['Exercise', `${row.title} (${row.kind}, ${row.difficulty})`],
          ['Given', row.context],
          ['Question', row.prompt]
        ])
      )
    };
  }
  if (contextType === 'course') {
    const row = get<{ title: string; summary: string; objectives: string; prerequisites_note: string }>(
      db,
      'SELECT title, summary, objectives, prerequisites_note FROM courses WHERE id = @id',
      { id: contextId }
    );
    if (!row) return null;
    return {
      title: row.title,
      material: clip(
        sections([
          ['Course', row.title],
          ['Summary', row.summary],
          ['Objectives', bullets(row.objectives)],
          ['Prerequisites', row.prerequisites_note]
        ])
      )
    };
  }
  if (contextType === 'path') {
    const row = get<{ name: string; summary: string; description: string; objectives: string }>(
      db,
      'SELECT name, summary, description, objectives FROM learning_paths WHERE id = @id',
      { id: contextId }
    );
    if (!row) return null;
    return {
      title: row.name,
      material: clip(
        sections([
          ['Learning path', row.name],
          ['Summary', row.summary],
          ['Description', row.description],
          ['Objectives', bullets(row.objectives)]
        ])
      )
    };
  }
  return null;
}
