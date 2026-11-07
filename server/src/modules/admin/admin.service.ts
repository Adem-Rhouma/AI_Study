import type Database from 'better-sqlite3';
import { z } from 'zod';
import { get } from '../../db/sql.js';
import { ApiError } from '../../lib/http.js';
import { decryptSecret, encryptSecret, secretHint } from '../../lib/crypto.js';
import { PROVIDER_ADAPTERS, completeChat, type ProviderAdapter, type ProviderSettings } from '../ai/providers.js';
import {
  ADMIN_KINDS,
  docSchema,
  ITEM_SHAPES,
  kindOrThrow,
  withDefaults,
  type AdminField,
  type AdminKind,
  type RefTarget
} from './admin.kinds.js';
import {
  accountById,
  changeLog,
  deleteContent,
  deleteProviderRow,
  lessonRevision,
  lessonRevisions,
  listContent,
  otherActiveAdmins,
  overview,
  providerById,
  providerNameTaken,
  providerRows,
  readContent,
  recordChange,
  refOptions,
  REF_TARGET_NAMES,
  saveContent,
  setStatus,
  signOutEverywhere,
  userRows,
  writeAccount,
  writeProvider,
  type Staff
} from './admin.repo.js';

export { overview };

/** What a browser needs to render one control: no column names, no table names, no SQL. */
function presentField(field: AdminField) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required ?? false,
    max: field.max ?? null,
    min: field.min ?? null,
    options: field.options ? [...field.options] : null,
    hint: field.hint ?? null,
    target: field.target ?? null,
    default: field.default ?? null,
    integer: field.integer ?? false
  };
}

/**
 * Everything a browser needs to render one content type, so the Content Studio stays a generic
 * editor instead of a hand-written page per type. Column names and SQL stay on this side.
 */
function descriptor(kind: AdminKind) {
  return {
    kind: kind.kind,
    label: kind.label,
    hasSlug: kind.slugColumn !== undefined,
    statuses: kind.statuses ?? null,
    consequence: kind.consequence,
    fields: kind.fields.map(presentField),
    relations: kind.relations.map((relation) => ({ key: relation.key, label: relation.label, shape: relation.shape })),
    listCounts: (kind.listCounts ?? []).map((count) => ({ key: count.key, label: count.label }))
  };
}

export function kindDescriptors() {
  return ADMIN_KINDS.map(descriptor);
}

/** The child-row editors are built from the same vocabulary, one entry per relation shape. */
export function itemShapeDescriptors() {
  return Object.fromEntries(Object.entries(ITEM_SHAPES).map(([shape, fields]) => [shape, fields.map(presentField)]));
}

/** One payload for the Content Studio: the types, their child rows, and the adapters it may name. */
export function studioDescriptor() {
  return {
    kinds: kindDescriptors(),
    itemShapes: itemShapeDescriptors(),
    providerAdapters: [...PROVIDER_ADAPTERS]
  };
}

function parseDoc(kind: AdminKind, body: unknown): Record<string, unknown> {
  const parsed = docSchema(kind).safeParse(withDefaults(kind, (body ?? {}) as Record<string, unknown>));
  if (!parsed.success) {
    throw ApiError.unprocessable(`The ${kind.kind} document did not pass the content rules.`, parsed.error.issues.flatMap(fieldProblems));
  }
  return parsed.data as Record<string, unknown>;
}

/**
 * Zod reports a stray key on a strict object with an empty path, which would point at the whole
 * form. Staff need the name of the field they cannot set — that is the difference between a usable
 * editor and a mystery.
 */
function fieldProblems(issue: z.ZodIssue): { field: string; message: string }[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({ field: key, message: `There is no field called "${key}" to edit.` }));
  }
  return [{ field: issue.path.join('.') || 'body', message: issue.message }];
}

export function listKind(db: Database.Database, name: string, filters: { q: string; status: string; limit: number; offset: number }) {
  return listContent(db, kindOrThrow(name), filters);
}

export function readKind(db: Database.Database, name: string, ref: string) {
  const kind = kindOrThrow(name);
  return { kind: kind.kind, ...readContent(db, kind, ref) };
}

export function createKind(db: Database.Database, name: string, body: unknown, actor: Staff) {
  const kind = kindOrThrow(name);
  return saveContent(db, kind, parseDoc(kind, body), null, actor);
}

export function updateKind(db: Database.Database, name: string, ref: string, body: unknown, actor: Staff) {
  const kind = kindOrThrow(name);
  return saveContent(db, kind, parseDoc(kind, body), ref, actor);
}

export function removeKind(db: Database.Database, name: string, ref: string, actor: Staff) {
  return deleteContent(db, kindOrThrow(name), ref, actor);
}

export function setKindStatus(db: Database.Database, name: string, ref: string, status: string, actor: Staff) {
  return setStatus(db, kindOrThrow(name), ref, status, actor);
}

export function recentChanges(db: Database.Database, limit: number) {
  return changeLog(db, limit).map((row) => ({
    id: Number(row.id),
    at: String(row.created_at),
    actor: String(row.actor_name),
    kind: String(row.kind),
    ref: String(row.entity_ref),
    action: String(row.action),
    summary: String(row.summary)
  }));
}

export function revisions(db: Database.Database, ref: string, limit: number) {
  return lessonRevisions(db, ref, limit);
}
export function revision(db: Database.Database, ref: string, id: number) {
  return lessonRevision(db, ref, id);
}

/** Options for the `ref` selects, addressed the same way the editor will write them back. */
export function refs(db: Database.Database, target: string, course: string | null, q: string, limit: number) {
  if (!REF_TARGET_NAMES.includes(target as RefTarget)) throw ApiError.badRequest(`"${target}" is not a linkable content type.`);
  let courseId: number | null = null;
  if (target === 'course_modules') {
    if (course === null) throw ApiError.badRequest('Modules belong to a course; name that course first.');
    const found = get<{ id: number }>(db, 'SELECT id FROM courses WHERE slug = @course', { course });
    if (!found) throw ApiError.notFound(`No course with slug "${course}".`);
    courseId = Number(found.id);
  }
  return refOptions(db, target as RefTarget, courseId, q, limit).map((row) => ({
    value: String(row.value),
    label: String(row.label)
  }));
}

// ------------------------------------------------------------ AI providers

const providerSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    adapter: z.enum(PROVIDER_ADAPTERS as [ProviderAdapter, ...ProviderAdapter[]]),
    baseUrl: z.string().trim().max(300).default(''),
    model: z.string().trim().min(1).max(120),
    apiKey: z.string().trim().max(400).default(''),
    isEnabled: z.boolean().default(false),
    priority: z.coerce.number().int().min(0).max(100).default(0),
    temperature: z.coerce.number().min(0).max(2).default(0.3),
    maxTokens: z.coerce.number().int().min(64).max(8000).default(900),
    timeoutMs: z.coerce.number().int().min(1000).max(120_000).default(30_000)
  })
  .strict();

export type ProviderView = {
  id: number;
  name: string;
  adapter: string;
  baseUrl: string;
  model: string;
  keyStored: boolean;
  keyHint: string | null;
  isEnabled: boolean;
  priority: number;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

/** The only shape a provider is ever returned in: the secret has no field here. */
function presentProvider(row: Record<string, unknown>): ProviderView {
  return {
    id: Number(row.id),
    name: String(row.name),
    adapter: String(row.adapter),
    baseUrl: String(row.base_url ?? ''),
    model: String(row.model ?? ''),
    keyStored: String(row.api_key_ciphertext ?? '') !== '',
    keyHint: row.api_key_hint ? String(row.api_key_hint) : null,
    isEnabled: row.is_enabled === 1,
    priority: Number(row.priority ?? 0),
    temperature: Number(row.temperature ?? 0.3),
    maxTokens: Number(row.max_tokens ?? 900),
    timeoutMs: Number(row.timeout_ms ?? 30_000)
  };
}

export function listProviders(db: Database.Database): ProviderView[] {
  return providerRows(db).map(presentProvider);
}

export function saveProvider(db: Database.Database, body: unknown, id: number | null, actor: Staff): ProviderView {
  const input = providerSchema.parse(body ?? {});
  const existing = id === null ? null : providerById(db, id);
  if (existing === null && input.apiKey === '') {
    throw ApiError.badRequest('A new provider needs an API key. Leave it blank only to keep the stored one.');
  }
  if (providerNameTaken(db, input.name, id ?? -1)) throw ApiError.conflict(`Another provider is already called "${input.name}".`);

  const previousKey = existing ? String(existing.api_key_ciphertext ?? '') : '';
  const ciphertext = input.apiKey === '' ? previousKey : encryptSecret(input.apiKey);
  const hint = input.apiKey === '' ? (existing ? String(existing.api_key_hint ?? '') : '') : secretHint(input.apiKey);

  const savedId = writeProvider(
    db,
    {
      name: input.name,
      adapter: input.adapter,
      baseUrl: input.baseUrl,
      model: input.model,
      ciphertext,
      hint,
      isEnabled: input.isEnabled,
      priority: input.priority,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs
    },
    id
  );

  recordChange(db, actor, 'provider', savedId, input.name, existing ? 'update' : 'create', `${existing ? 'Updated' : 'Added'} provider "${input.name}"`);
  return presentProvider(providerById(db, savedId));
}

export function deleteProvider(db: Database.Database, id: number, actor: Staff): void {
  const row = providerById(db, id);
  deleteProviderRow(db, id);
  recordChange(db, actor, 'provider', id, String(row.name), 'delete', `Removed provider "${String(row.name)}"`);
}

/**
 * A real request to the configured endpoint. It is the only way an operator can tell that a key
 * works without waiting for a learner to hit the failure.
 */
export async function testProvider(db: Database.Database, id: number) {
  const row = providerById(db, id);
  const settings: ProviderSettings = {
    adapter: String(row.adapter) as ProviderAdapter,
    baseUrl: String(row.base_url ?? ''),
    model: String(row.model ?? ''),
    apiKey: String(row.api_key_ciphertext ?? '') === '' ? '' : decryptSecret(String(row.api_key_ciphertext)),
    temperature: 0.2,
    maxTokens: 64,
    timeoutMs: Math.min(20_000, Number(row.timeout_ms ?? 30_000))
  };
  const started = Date.now();
  const reply = await completeChat(settings, [
    { role: 'system', content: 'Reply with the single word: ready' },
    { role: 'user', content: 'Connection check.' }
  ]);
  return { ok: true as const, model: reply.model, excerpt: reply.text.slice(0, 140).trim(), latencyMs: Date.now() - started };
}

// ------------------------------------------------------------ accounts

const accountSchema = z
  .object({
    role: z.enum(['learner', 'author', 'admin']).optional(),
    isActive: z.boolean().optional()
  })
  .strict();

export function listUsers(db: Database.Database, filters: { q: string; limit: number; offset: number }) {
  const { items, total } = userRows(db, filters);
  return {
    total,
    items: items.map((row) => ({
      id: Number(row.id),
      email: String(row.email),
      displayName: String(row.display_name),
      role: String(row.role),
      isActive: row.is_active === 1,
      sessions: Number(row.sessions ?? 0),
      createdAt: String(row.created_at),
      lastLoginAt: row.last_login_at == null ? null : String(row.last_login_at)
    }))
  };
}

export function updateAccount(db: Database.Database, id: number, body: unknown, actor: Staff & { role: string }) {
  const patch = accountSchema.parse(body ?? {});
  const target = accountById(db, id);
  if (patch.role === undefined && patch.isActive === undefined) throw ApiError.badRequest('Nothing to change.');

  // The two ways to lock a whole team out of the platform, blocked here rather than discovered later.
  if (id === actor.id && (patch.role === 'learner' || patch.isActive === false)) {
    throw ApiError.badRequest('You cannot remove your own access. Ask another administrator.');
  }
  if ((patch.role === 'learner' || patch.isActive === false) && target.role === 'admin') {
    if (otherActiveAdmins(db, id) === 0) throw ApiError.badRequest('This is the last active administrator. Promote somebody else first.');
  }

  const role = patch.role ?? target.role;
  const isActive = patch.isActive ?? target.isActive;
  writeAccount(db, id, role, isActive);
  if (!isActive) signOutEverywhere(db, id);

  recordChange(
    db,
    actor,
    'user',
    id,
    target.displayName,
    'user',
    `Account "${target.displayName}" is now ${role}${isActive ? '' : ' and deactivated'}`
  );
  return { id, role, isActive };
}
