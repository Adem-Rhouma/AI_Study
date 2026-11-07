import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type {
  AssistantAskResponse,
  AssistantMessage,
  AssistantStatus,
  AssistantThreadDetail,
  AssistantThreadPage
} from '../../api/types';
import { useSession } from '../../lib/session';
import { formatRelative } from '../../lib/format';
import { Markdown } from '../content/Markdown';
import { Button } from '../ui/Button';
import { Card, SectionHeader } from '../ui/Surface';
import { InlineAlert, SkeletonCard, errorMessage } from '../ui/Feedback';
import { Textarea } from '../ui/Field';
import { Modal } from '../ui/Overlay';

export type AssistantContext = { kind: 'topic' | 'lesson' | 'exercise' | 'path' | 'course'; slug: string };

/** Tutor moves rather than fake facts: the learner asks, and the model only ever sees curriculum text. */
const STARTERS = [
  'Explain this in plain language',
  'What should I be able to do after this?',
  'Quiz me on the key ideas',
  'Where do learners usually go wrong?'
];

function optimistic(role: 'user' | 'assistant', id: number, content: string, error: string | null = null): AssistantMessage {
  return { id, role, content, model: null, error, createdAt: new Date().toISOString() };
}

export function StudyAssistant({ context, entryTitle }: { context: AssistantContext; entryTitle: string }) {
  const { session } = useSession();
  const signedIn = session.user !== null;
  const [open, setOpen] = useState(false);

  const status = useQuery({
    queryKey: keys.aiStatus,
    queryFn: () => api.get<AssistantStatus>('/ai/status'),
    staleTime: 60_000,
    enabled: signedIn
  });

  if (!signedIn) return null;

  return (
    <>
      <Card>
        <SectionHeader eyebrow="Assistant" title="Study assistant" actions={<Sparkles size={15} aria-hidden />} />
        <div className="mt-3">
          {status.isLoading ? (
            <p className="text-caption text-ink-muted">Checking whether the assistant is configured…</p>
          ) : status.error ? (
            <InlineAlert tone="danger" title="The assistant status could not be read">
              {errorMessage(status.error)}
            </InlineAlert>
          ) : status.data && !status.data.configured ? (
            <InlineAlert tone="info" title="Not configured on this install">
              {status.data.note}
            </InlineAlert>
          ) : status.data && !status.data.enabledForUser ? (
            <InlineAlert tone="warning" title="Switched off for your account">
              The assistant is turned off in your settings. Turn it back on to ask questions about this {context.kind}.
            </InlineAlert>
          ) : (
            <>
              <p className="text-caption text-ink-secondary">
                Ask about this {context.kind}. Answers come from a language model, so they can be wrong — the
                curriculum pages stay the source of truth.
              </p>
              <Button className="mt-3" size="sm" block onClick={() => setOpen(true)}>
                <MessageSquarePlus size={15} aria-hidden />
                Ask a question
              </Button>
            </>
          )}
        </div>
      </Card>
      {open && <AssistantDialog context={context} entryTitle={entryTitle} onClose={() => setOpen(false)} status={status.data} />}
    </>
  );
}

function AssistantDialog({
  context,
  entryTitle,
  onClose,
  status
}: {
  context: AssistantContext;
  entryTitle: string;
  onClose: () => void;
  status: AssistantStatus | undefined;
}) {
  const client = useQueryClient();
  const [threadId, setThreadId] = useState<number | null>(null);
  const [wantNewThread, setWantNewThread] = useState(false);
  const [turns, setTurns] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  // Local turns need keys before the server gives them ids. Date.now() collides when a question and
  // its failure are added in the same tick, so the ids come down from a counter instead.
  const localId = useRef(0);
  const nextTurn = (role: 'user' | 'assistant', content: string, error: string | null = null) =>
    optimistic(role, --localId.current, content, error);

  const threads = useQuery({
    queryKey: keys.aiThreads({ kind: context.kind, slug: context.slug }),
    queryFn: () =>
      api.get<AssistantThreadPage>('/ai/conversations', { context: context.kind, slug: context.slug, perPage: 1 }),
    enabled: threadId === null && !wantNewThread
  });

  const detail = useQuery({
    queryKey: keys.aiThread(threadId ?? 0),
    queryFn: () => api.get<AssistantThreadDetail>(`/ai/conversations/${threadId}`),
    enabled: threadId !== null
  });

  // Continue the most recent thread opened from this entry, unless the learner asked for a new one.
  useEffect(() => {
    if (threadId !== null || wantNewThread) return;
    const latest = threads.data?.conversations[0];
    if (latest) setThreadId(latest.id);
  }, [threads.data, threadId, wantNewThread]);

  useEffect(() => {
    if (detail.data && turns.length === 0) setTurns(detail.data.messages);
  }, [detail.data, turns.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns]);

  const ask = useMutation({
    mutationFn: (question: string) =>
      api.post<AssistantAskResponse>('/ai/ask', { question, conversationId: threadId ?? undefined, context }),
    onSuccess: (data, question) => {
      const asked = nextTurn('user', question);
      setThreadId(data.conversation.id);
      setWantNewThread(false);
      setDraft('');
      setTurns((current) => [...current, asked, data.message]);
      void client.invalidateQueries({ queryKey: keys.aiThreads({ kind: context.kind, slug: context.slug }) });
      void client.invalidateQueries({ queryKey: keys.aiStatus });
    },
    onError: (error, question) => {
      // Mirror what the server stored: the question is kept, the answer is marked as failed.
      const asked = nextTurn('user', question);
      const failed = nextTurn('assistant', '', errorMessage(error));
      setTurns((current) => [...current, asked, failed]);
    }
  });

  const question = draft.trim();
  const pending = ask.isPending;

  function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed === '' || pending) return;
    ask.mutate(trimmed);
  }

  return (
    <Modal
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={`Study assistant — ${entryTitle}`}
      description={`It reads this ${context.kind}'s own curriculum text, not the open web.`}
      size="lg"
    >
      <div className="space-y-4">
        {detail.isLoading ? (
          <SkeletonCard lines={4} />
        ) : detail.error ? (
          <InlineAlert tone="danger" title="This conversation could not be opened">
            {errorMessage(detail.error)}
          </InlineAlert>
        ) : null}

        {turns.length === 0 && !detail.isLoading && (
          <div>
            <p className="text-caption text-ink-secondary">
              Nothing asked about this {context.kind} yet. Pick a starting point or write your own question.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <Button key={starter} size="sm" variant="secondary" onClick={() => submit(starter)} disabled={pending}>
                  {starter}
                </Button>
              ))}
            </div>
          </div>
        )}

        <ul className="space-y-4">
          {turns.map((turn) => (
            <li key={turn.id}>
              <p className="eyebrow text-caption">{turn.role === 'user' ? 'You' : 'Assistant'}</p>
              {turn.error !== null ? (
                <InlineAlert className="mt-2" tone="warning" title="No answer was produced">
                  {turn.error} Your question stays in this thread.
                </InlineAlert>
              ) : turn.role === 'user' ? (
                <p className="mt-1 whitespace-pre-wrap text-body text-ink">{turn.content}</p>
              ) : (
                <Markdown className="mt-1" source={turn.content} withIds={false} />
              )}
              {turn.role === 'assistant' && turn.error === null && (
                <p className="mt-1 text-caption text-ink-muted">
                  {[status?.provider?.name, turn.model, formatRelative(turn.createdAt)].filter(Boolean).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>

        {pending && (
          <p className="flex items-center gap-2 text-caption text-ink-muted" role="status">
            <Sparkles size={14} aria-hidden className="animate-pulse" />
            Thinking…
          </p>
        )}
        <div ref={endRef} />

        <form
          className="space-y-2 border-t border-[var(--border-subtle)] pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
        >
          <label className="eyebrow text-caption" htmlFor="assistant-question">
            Your question
          </label>
          <Textarea
            id="assistant-question"
            rows={3}
            value={draft}
            placeholder="What would you like to understand?"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(question);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={question === '' || pending}>
                {pending ? 'Asking…' : 'Ask'}
              </Button>
              {threadId !== null && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setThreadId(null);
                    setWantNewThread(true);
                    setTurns([]);
                  }}
                  disabled={pending}
                >
                  Start a new thread
                </Button>
              )}
            </div>
            <p className="text-caption text-ink-muted">
              {status ? `Up to ${status.rateLimitPerMinute} questions a minute. ` : ''}
              Ctrl+Enter sends.
            </p>
          </div>
        </form>
      </div>
    </Modal>
  );
}
