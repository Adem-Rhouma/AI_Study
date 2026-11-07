import type Database from 'better-sqlite3';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { requireAuth } from '../../lib/auth-context.js';
import { ApiError, handler, param } from '../../lib/http.js';
import { paginationSchema } from '../../lib/domain.js';
import { RateLimiter } from '../../lib/rateLimit.js';
import {
  AI_CONTEXT_TYPES,
  countMessages,
  deleteConversation,
  describeContext,
  getConversation,
  listConversations,
  listMessages,
  resolveContext,
  type AiContextType,
  type ConversationRow,
  type MessageRow
} from './ai.repo.js';
import { ask, assistantStatus } from './ai.service.js';

export const aiRouter = Router();

/**
 * Per learner rather than per IP: one shared address (a campus, a home NAT) should not starve a class.
 * Exported so a test can start from an empty window — account ids restart at 1 for every in-memory database.
 */
export const assistantLimiter = new RateLimiter(config.rateLimit.aiPerMinute, 60_000, 'study assistant');

const contextSchema = z.object({
  kind: z.enum(['topic', 'lesson', 'exercise', 'path', 'course']),
  slug: z.string().trim().min(1).max(120)
});

const askSchema = z.object({
  question: z.string().trim().min(2).max(4000),
  conversationId: z.number().int().positive().optional(),
  // Ignored when continuing an existing thread: a conversation stays about what opened it.
  context: contextSchema.optional()
});

const listSchema = paginationSchema.extend({
  context: z.enum(AI_CONTEXT_TYPES).optional(),
  // Narrows a kind to one entry: "the threads I opened from this lesson".
  slug: z.string().trim().max(120).optional()
});

function presentMessage(row: MessageRow) {
  return {
    id: Number(row.id),
    role: row.role,
    content: row.content,
    model: row.model,
    /** Set when the provider failed; content is then empty and the turn is shown as unsuccessful. */
    error: row.error,
    createdAt: row.created_at
  };
}

function presentConversation(db: Database.Database, row: ConversationRow, messageCount: number) {
  return {
    id: Number(row.id),
    title: row.title,
    context: presentContext(db, row.context_type, row.context_id),
    messageCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function presentContext(db: Database.Database, kind: AiContextType, id: number | null) {
  if (kind === 'general' || id === null) return null;
  const target = describeContext(db, kind, Number(id));
  // The curriculum entry can be deleted under a still-owned thread; keep the kind, drop the dead link.
  return target ? { kind, slug: target.slug, title: target.title } : { kind, slug: null, title: null };
}

aiRouter.get(
  '/status',
  handler((req, res) => {
    res.json(assistantStatus(req.db, req.user?.id ?? null));
  })
);

aiRouter.post(
  '/ask',
  requireAuth,
  handler(async (req, res) => {
    const input = askSchema.parse(req.body ?? {});
    const userId = req.user!.id;
    assistantLimiter.check(`ai:${userId}`);
    const result = await ask(req.db, {
      userId,
      question: input.question,
      conversationId: input.conversationId,
      context: input.context
    });
    res.json({
      conversation: presentConversation(req.db, result.conversation, countMessages(req.db, result.conversation.id)),
      message: presentMessage(result.message),
      provider: result.providerName,
      latencyMs: result.latencyMs
    });
  })
);

aiRouter.get(
  '/conversations',
  requireAuth,
  handler((req, res) => {
    const query = listSchema.parse(req.query);
    const userId = req.user!.id;
    let contextId: number | null = null;
    if (query.slug && query.context && query.context !== 'general') {
      const target = resolveContext(req.db, query.context, query.slug);
      if (!target) throw ApiError.notFound(`Unknown ${query.context} "${query.slug}".`);
      contextId = target.id;
    }
    const { items, total } = listConversations(req.db, userId, {
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage,
      contextType: query.context,
      contextId
    });
    res.json({
      conversations: items.map((row) => presentConversation(req.db, row, row.messageCount)),
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

aiRouter.get(
  '/conversations/:id',
  requireAuth,
  handler((req, res) => {
    const userId = req.user!.id;
    const id = Number(param(req, 'id'));
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid conversation id.');
    const conversation = getConversation(req.db, userId, id);
    if (!conversation) throw ApiError.notFound('Conversation not found.');
    res.json({
      conversation: presentConversation(req.db, conversation, countMessages(req.db, id)),
      messages: listMessages(req.db, id, 100).map(presentMessage)
    });
  })
);

aiRouter.delete(
  '/conversations/:id',
  requireAuth,
  handler((req, res) => {
    const userId = req.user!.id;
    const id = Number(param(req, 'id'));
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid conversation id.');
    if (deleteConversation(req.db, userId, id) === 0) throw ApiError.notFound('Conversation not found.');
    res.json({ deleted: true, id });
  })
);
