import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  CircleSlash,
  Clock,
  Lightbulb,
  Lock,
  Send,
  Sparkles,
  XCircle
} from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type {
  ArenaExerciseDetail,
  ArenaHintSlot,
  AttemptListItem,
  AttemptPage,
  AttemptResult,
  HintUnlockResult
} from '../api/types';
import { useSession } from '../lib/session';
import { exerciseKindLabel, formatDateTime, formatRelative, percent, REVIEW_ONLY_KINDS } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { StudyAssistant } from '../components/assistant/StudyAssistant';
import { Card, Divider, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, errorMessage, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { Button, LinkButton } from '../components/ui/Button';
import { Field, Input, Textarea } from '../components/ui/Field';
import { DataTable, type Column } from '../components/ui/Table';
import { Markdown } from '../components/content/Markdown';

type AttemptRow = AttemptListItem | ArenaExerciseDetail['exercise']['attempts'][number];

export default function ExercisePage() {
  const { slug = '' } = useParams();
  const { isAuthenticated } = useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: keys.exercise(slug),
    queryFn: () => api.get<ArenaExerciseDetail>(`/arena/exercises/${slug}`)
  });

  const [answer, setAnswer] = useState<AnswerState>(emptyAnswer);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  // Navigating between exercises must not carry an answer, a result or a timer across.
  useEffect(() => {
    setAnswer(emptyAnswer);
    setResult(null);
    setAttemptError(null);
    setHintError(null);
    startedAt.current = Date.now();
  }, [slug]);

  const loaded = query.data?.exercise;
  const expectedUnit = loaded?.kind === 'numeric' ? loaded.answerSpec.unit : null;
  // Prefill the unit the grader expects so a correct number is never flagged as a unit mismatch.
  useEffect(() => {
    if (!expectedUnit) return;
    setAnswer((previous) => (previous.numericUnit === '' ? { ...previous, numericUnit: expectedUnit } : previous));
  }, [expectedUnit]);

  const exercise = loaded;

  const invalidatePractice = () => {
    void queryClient.invalidateQueries({ queryKey: keys.exercise(slug) });
    void queryClient.invalidateQueries({ queryKey: keys.arenaStats });
    void queryClient.invalidateQueries({ queryKey: keys.myAttempts() });
    // One prefix covers mastery, the progress overview and the review queue.
    void queryClient.invalidateQueries({ queryKey: keys.progressAll });
  };

  const submit = useMutation({
    mutationFn: (payload: { answer: unknown; durationSeconds: number }) =>
      api.post<AttemptResult>(`/arena/exercises/${slug}/attempt`, payload),
    onSuccess: (data) => {
      setResult(data);
      setAttemptError(null);
      invalidatePractice();
    },
    onError: (error) => {
      setResult(null);
      setAttemptError(errorMessage(error));
    }
  });

  const unlockHint = useMutation({
    mutationFn: (index: number) => api.post<HintUnlockResult>(`/arena/exercises/${slug}/hint`, { index }),
    onSuccess: () => {
      setHintError(null);
      invalidatePractice();
    },
    onError: (error) => setHintError(errorMessage(error))
  });

  const history = useQuery({
    queryKey: keys.myAttempts({ page: 1, perPage: 50 }),
    queryFn: () => api.get<AttemptPage>('/arena/attempts', { page: 1, perPage: 50 }),
    enabled: isAuthenticated
  });

  const attemptColumns = useMemo<Column<AttemptRow>[]>(
    () => [
      {
        key: 'index',
        header: '#',
        cell: (row) => <span className="tnum">{row.attemptIndex}</span>,
        align: 'right'
      },
      {
        key: 'result',
        header: 'Result',
        cell: (row) => <ResultLabel isCorrect={row.isCorrect} />
      },
      {
        key: 'score',
        header: 'Credit',
        cell: (row) => <span className="tnum">{percent(row.score)}</span>,
        align: 'right'
      },
      {
        key: 'hints',
        header: 'Hints',
        cell: (row) => <span className="tnum">{row.hintsUsed}</span>,
        align: 'right'
      },
      {
        key: 'duration',
        header: 'Time',
        cell: (row) => (row.durationSeconds === null ? '—' : `${Math.max(1, Math.round(row.durationSeconds / 60))} min`),
        align: 'right'
      },
      {
        key: 'when',
        header: 'When',
        cell: (row) => <span title={formatDateTime(row.createdAt)}>{formatRelative(row.createdAt)}</span>
      }
    ],
    []
  );

  if (query.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Problem Arena" title="Loading exercise…" />
        <SkeletonRows rows={6} />
      </>
    );
  }

  if (query.error) {
    return (
      <>
        <PageHeader
          eyebrow="Problem Arena"
          title="Exercise unavailable"
          crumbs={[{ label: 'Problem Arena', to: '/arena' }, { label: 'Not found' }]}
        />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }

  if (!exercise) {
    return (
      <>
        <PageHeader eyebrow="Problem Arena" title="Exercise unavailable" />
        <EmptyState title="This exercise does not exist" description="It may have been withdrawn by its author." />
      </>
    );
  }

  const reviewOnly = REVIEW_ONLY_KINDS.includes(exercise.kind);
  const ready = isAnswerComplete(exercise.kind, answer);
  const topicLinks = [
    ...(exercise.topic ? [{ slug: exercise.topic.slug, name: exercise.topic.name, primary: true }] : []),
    ...exercise.relatedTopics
      .filter((topic) => topic.slug !== exercise.topic?.slug)
      .map((topic) => ({ slug: topic.slug, name: topic.name, primary: false }))
  ];
  const exerciseAttempts = history.data?.attempts.filter((row) => row.exerciseSlug === exercise.slug) ?? [];
  const rows: AttemptRow[] = exerciseAttempts.length > 0 ? exerciseAttempts : exercise.attempts;

  const onSubmit = () => {
    const payload = buildAnswer(exercise.kind, answer);
    if (payload === null) return;
    submit.mutate({
      answer: payload,
      durationSeconds: Math.max(0, Math.round((Date.now() - startedAt.current) / 1000))
    });
  };

  return (
    <>
      <PageHeader
        eyebrow="Problem Arena"
        title={exercise.title}
        crumbs={[{ label: 'Problem Arena', to: '/arena' }, { label: exercise.title }]}
        actions={
          <LinkButton to="/arena" variant="ghost" size="sm">
            <ArrowLeft size={14} aria-hidden /> All exercises
          </LinkButton>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{exerciseKindLabel(exercise.kind)}</Chip>
          <DifficultyChip difficulty={exercise.difficulty} />
          <Chip icon={<Award size={12} aria-hidden />}>
            <span className="tnum">{exercise.points} pts</span>
          </Chip>
          {reviewOnly && (
            <Chip tone="warning" icon={<CircleSlash size={12} aria-hidden />}>
              Review-graded
            </Chip>
          )}
          {exercise.tags.map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <Markdown source={exercise.prompt} withIds={false} />
            {exercise.context && (
              <>
                <Divider className="my-4" label="Context" />
                <Markdown source={exercise.context} withIds={false} className="text-caption" />
              </>
            )}
            {exercise.answerNote && (
              <InlineAlert tone="info" className="mt-4" title="How your answer is read">
                {exercise.answerNote}
              </InlineAlert>
            )}
            {exercise.kind === 'numeric' && (
              <p className="mt-3 text-caption text-ink-muted">
                Accepted tolerance: <span className="tnum">±{exercise.answerSpec.tolerance}</span>
                {exercise.answerSpec.unit ? ` · expected unit: ${exercise.answerSpec.unit}` : ''}
              </p>
            )}
          </Card>

          {!isAuthenticated ? (
            <Card>
              <InlineAlert tone="warning" title="Sign in to answer">
                Attempts, hints and mastery are recorded per account, so the answer controls stay locked until you
                sign in. You can still read the problem above.
              </InlineAlert>
              <div className="mt-3 flex gap-2">
                <LinkButton to="/login" size="sm">
                  Sign in
                </LinkButton>
                <LinkButton to="/register" variant="secondary" size="sm">
                  Create an account
                </LinkButton>
              </div>
            </Card>
          ) : (
            <>
              <Card>
                <SectionHeader eyebrow="Your answer" title={answerTitle(exercise.kind)} />
                <div className="mt-4">
                  <AnswerControls
                    kind={exercise.kind}
                    exercise={exercise}
                    answer={answer}
                    onChange={setAnswer}
                    submitted={result !== null}
                  />
                </div>

                {hintError && (
                  <InlineAlert tone="danger" className="mt-4">
                    {hintError}
                  </InlineAlert>
                )}
                {attemptError && (
                  <InlineAlert tone="danger" className="mt-4" title="This attempt was not recorded">
                    {attemptError}
                  </InlineAlert>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={onSubmit}
                    loading={submit.isPending}
                    disabled={!ready}
                    iconLeft={<Send size={15} aria-hidden />}
                  >
                    {reviewOnly ? 'Submit for review' : 'Submit answer'}
                  </Button>
                  {result !== null && !reviewOnly && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setResult(null);
                        startedAt.current = Date.now();
                      }}
                    >
                      Clear result and try again
                    </Button>
                  )}
                  {!ready && <span className="text-caption text-ink-muted">Complete your answer to submit.</span>}
                </div>

                {reviewOnly && (
                  <p className="mt-3 text-caption text-ink-muted">
                    {exercise.kind === 'code'
                      ? 'Your code is stored as text and graded by a human read. It is never executed.'
                      : 'Your working is stored and graded by a human read. No automatic marking is attempted.'}
                  </p>
                )}
              </Card>

              <HintsPanel
                slots={exercise.hints.available}
                onUnlock={(index) => unlockHint.mutate(index)}
                pending={unlockHint.isPending}
                pendingIndex={unlockHint.variables ?? null}
              />

              {result && <ResultPanel result={result} />}
            </>
          )}

          <Card>
            <SectionHeader
              eyebrow="Attempt history"
              title={isAuthenticated ? 'Every recorded attempt' : 'Sign in to record attempts'}
              description={
                isAuthenticated
                  ? 'Credit is the fraction of the exercise you earned after the hint discount. Review-graded kinds always record 0 until a human reads them.'
                  : undefined
              }
            />
            <div className="mt-3">
              {!isAuthenticated ? (
                <EmptyState title="No history yet" description="Sign in and your attempts will be listed here." />
              ) : history.isLoading ? (
                <SkeletonRows rows={3} />
              ) : history.error ? (
                <ErrorState error={history.error} onRetry={() => void history.refetch()} />
              ) : (
                <DataTable
                  rows={rows}
                  columns={attemptColumns}
                  rowKey={(row) => row.id}
                  dense
                  empty={
                    <EmptyState
                      title="No attempts on this exercise yet"
                      description="Your first submission will appear here with its credit and hint count."
                    />
                  }
                />
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          {exercise.lesson && (
            <Card>
              <SectionHeader eyebrow="From the lesson" title={exercise.lesson.title} />
              <LinkButton to={`/lessons/${exercise.lesson.slug}`} variant="secondary" size="sm" className="mt-3" block>
                Open the lesson
              </LinkButton>
            </Card>
          )}

          <Card>
            <SectionHeader eyebrow="Topics" title="What this practices" />
            {topicLinks.length === 0 ? (
              <p className="mt-3 text-caption text-ink-muted">This exercise is not attached to a topic.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topicLinks.map((topic) => (
                  <li key={topic.slug}>
                    <Link
                      to={`/explore/${topic.slug}`}
                      className="block rounded-card border border-line bg-sunken px-3 py-2 text-caption text-ink transition-colors hover:border-[var(--border-strong)]"
                    >
                      {topic.name}
                      {topic.primary ? (
                        <span className="block text-ink-muted">Primary topic</span>
                      ) : (
                        <span className="block text-ink-muted">Also practises this</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeader eyebrow="Grading" title="How this kind is marked" />
            <dl className="mt-3 space-y-2 text-caption">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Kind</dt>
                <dd className="text-ink">{exerciseKindLabel(exercise.kind)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Max points</dt>
                <dd className="tnum text-ink">{exercise.points}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Hints available</dt>
                <dd className="tnum text-ink">{exercise.hints.count}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Marked by</dt>
                <dd className="text-ink">{reviewOnly ? 'Human review' : 'Automatic grader'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-caption leading-relaxed text-ink-muted">
              Hints are counted per attempt and discount the credit the server awards. Using a hint is never hidden
              from your own history.
            </p>
          </Card>

          <StudyAssistant context={{ kind: 'exercise', slug: exercise.slug }} entryTitle={exercise.title} />

          {exercise.status !== 'published' && (
            <InlineAlert tone="warning" title="Not published">
              You can see this exercise because your account has author or admin rights. Learners cannot reach it yet.
            </InlineAlert>
          )}
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ answers */

type AnswerState = {
  choice: string;
  choices: string[];
  bool: 'true' | 'false' | '';
  numericValue: string;
  numericUnit: string;
  text: string;
  matches: Record<string, string>;
};

const emptyAnswer: AnswerState = {
  choice: '',
  choices: [],
  bool: '',
  numericValue: '',
  numericUnit: '',
  text: '',
  matches: {}
};

function answerTitle(kind: string): string {
  switch (kind) {
    case 'single_choice':
      return 'Choose one option';
    case 'multi_choice':
      return 'Choose every option that applies';
    case 'true_false':
      return 'True or false';
    case 'numeric':
      return 'Enter a number';
    case 'match':
      return 'Match each item';
    case 'code':
      return 'Write your code';
    case 'derivation':
      return 'Show your working';
    default:
      return 'Write your answer';
  }
}

function isAnswerComplete(kind: string, answer: AnswerState): boolean {
  switch (kind) {
    case 'single_choice':
      return answer.choice !== '';
    case 'multi_choice':
      return answer.choices.length > 0;
    case 'true_false':
      return answer.bool !== '';
    case 'numeric':
      return Number.isFinite(Number(answer.numericValue.replace(/,/g, '').trim())) && answer.numericValue.trim() !== '';
    case 'match':
      return Object.keys(answer.matches).length > 0;
    default:
      return answer.text.trim() !== '';
  }
}

/** `null` means "nothing to send"; the submit button is disabled in that case anyway. */
function buildAnswer(kind: string, answer: AnswerState): unknown | null {
  switch (kind) {
    case 'single_choice':
      return answer.choice === '' ? null : answer.choice;
    case 'multi_choice':
      return answer.choices.length === 0 ? null : answer.choices;
    case 'true_false':
      return answer.bool === '' ? null : answer.bool === 'true';
    case 'numeric':
      return answer.numericValue.trim() === ''
        ? null
        : { value: answer.numericValue.trim(), unit: answer.numericUnit.trim() || undefined };
    case 'match':
      return Object.keys(answer.matches).length === 0
        ? null
        : Object.entries(answer.matches).map(([left, right]) => ({ left, right }));
    default:
      return answer.text.trim() === '' ? null : answer.text;
  }
}

function AnswerControls({
  kind,
  exercise,
  answer,
  onChange,
  submitted
}: {
  kind: string;
  exercise: ArenaExerciseDetail['exercise'];
  answer: AnswerState;
  onChange: (next: AnswerState) => void;
  submitted: boolean;
}) {
  const set = (patch: Partial<AnswerState>) => onChange({ ...answer, ...patch });

  if (kind === 'single_choice' || kind === 'multi_choice') {
    const isMulti = kind === 'multi_choice';
    return (
      <fieldset>
        <legend className="sr-only">{answerTitle(kind)}</legend>
        <ul className="space-y-2">
          {exercise.options.map((option) => {
            const checked = isMulti ? answer.choices.includes(option.label) : answer.choice === option.label;
            return (
              <li key={option.label}>
                <label
                  className={
                    'flex cursor-pointer items-start gap-3 rounded-card border px-3 py-2.5 transition-colors ' +
                    (checked
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-raised hover:border-[var(--border-strong)]')
                  }
                >
                  <input
                    type={isMulti ? 'checkbox' : 'radio'}
                    name={`answer-${exercise.slug}`}
                    checked={checked}
                    onChange={() => {
                      if (isMulti) {
                        set({
                          choices: checked
                            ? answer.choices.filter((label) => label !== option.label)
                            : [...answer.choices, option.label]
                        });
                      } else {
                        set({ choice: option.label });
                      }
                    }}
                    className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-body text-ink">
                      <span className="mr-1.5 font-mono text-caption text-ink-muted">{option.label}.</span>
                      {option.text}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {exercise.options.length === 0 && (
          <InlineAlert tone="warning" className="mt-2">
            This exercise has no options on record, so it cannot be answered yet. It needs author review.
          </InlineAlert>
        )}
      </fieldset>
    );
  }

  if (kind === 'true_false') {
    return (
      <fieldset>
        <legend className="sr-only">True or false</legend>
        <div className="flex flex-wrap gap-2">
          {(['true', 'false'] as const).map((value) => (
            <label
              key={value}
              className={
                'flex cursor-pointer items-center gap-2 rounded-card border px-4 py-2.5 text-body transition-colors ' +
                (answer.bool === value
                  ? 'border-accent bg-accent-soft text-ink'
                  : 'border-line bg-raised text-ink-secondary hover:border-[var(--border-strong)]')
              }
            >
              <input
                type="radio"
                name={`answer-${exercise.slug}`}
                checked={answer.bool === value}
                onChange={() => set({ bool: value })}
                className="size-4 accent-[var(--accent)]"
              />
              {value === 'true' ? 'True' : 'False'}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (kind === 'numeric') {
    return (
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="Value" htmlFor="numeric-value" required hint="Numbers only; commas are allowed">
          <Input
            id="numeric-value"
            inputMode="decimal"
            autoComplete="off"
            value={answer.numericValue}
            onChange={(event) => set({ numericValue: event.target.value })}
            placeholder="0.0"
            className="tnum"
          />
        </Field>
        <Field label="Unit" htmlFor="numeric-unit" hint={exercise.answerSpec.unit ? `expected: ${exercise.answerSpec.unit}` : 'optional'}>
          <Input
            id="numeric-unit"
            autoComplete="off"
            value={answer.numericUnit}
            onChange={(event) => set({ numericUnit: event.target.value })}
            placeholder={exercise.answerSpec.unit ?? '—'}
          />
        </Field>
      </div>
    );
  }

  if (kind === 'match') {
    const columns = exercise.answerSpec.match;
    if (!columns) {
      return (
        <InlineAlert tone="warning">
          This matching exercise has no pairs on record, so it cannot be answered yet. It needs author review.
        </InlineAlert>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-caption text-ink-muted">
          Pick the right-hand item for each stem. {columns.lefts.length} stems, {columns.rights.length} options.
          {submitted ? ' Your picks are kept so you can compare them with the feedback.' : ''}
        </p>
        <ul className="space-y-2">
          {columns.lefts.map((left) => (
            <li key={left} className="grid gap-2 rounded-card border border-line bg-sunken p-3 sm:grid-cols-2 sm:items-center">
              <span className="text-body text-ink">{left}</span>
              <label className="sr-only" htmlFor={`match-${left}`}>
                Match for: {left}
              </label>
              <select
                id={`match-${left}`}
                value={answer.matches[left] ?? ''}
                onChange={(event) =>
                  set({ matches: { ...answer.matches, [left]: event.target.value } })
                }
                className="w-full rounded-input border border-line bg-raised px-3 py-2 text-body text-ink"
              >
                <option value="">Choose…</option>
                {columns.rights.map((right) => (
                  <option key={right} value={right}>
                    {right}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (kind === 'code') {
    return (
      <Field
        label="Your code"
        htmlFor="code-answer"
        required
        hint={exercise.answerSpec.language ? exercise.answerSpec.language : 'plain text'}
      >
        <Textarea
          id="code-answer"
          rows={14}
          spellCheck={false}
          value={answer.text}
          onChange={(event) => set({ text: event.target.value })}
          placeholder={exercise.answerSpec.starter || 'Write your solution…'}
          className="font-mono text-caption leading-relaxed"
        />
      </Field>
    );
  }

  if (kind === 'derivation') {
    return (
      <Field label="Your working" htmlFor="derivation-answer" required hint="Markdown and LaTeX are supported">
        <Textarea
          id="derivation-answer"
          rows={12}
          value={answer.text}
          onChange={(event) => set({ text: event.target.value })}
          placeholder="Start from what is given and show each step…"
          className="leading-relaxed"
        />
      </Field>
    );
  }

  const isExpression = kind === 'expression';
  return (
    <Field
      label="Your answer"
      htmlFor="text-answer"
      required
      hint={isExpression ? 'plain notation, e.g. 1/(1-p)' : 'a word or short phrase'}
    >
      {isExpression ? (
        <Input
          id="text-answer"
          autoComplete="off"
          value={answer.text}
          onChange={(event) => set({ text: event.target.value })}
          placeholder="1/(1-p)"
          className="font-mono"
        />
      ) : (
        <Textarea
          id="text-answer"
          rows={3}
          value={answer.text}
          onChange={(event) => set({ text: event.target.value })}
          placeholder="Write your answer…"
        />
      )}
      {exercise.answerSpec.matchMode && (
        <p className="mt-1.5 text-caption text-ink-muted">
          Marked by {exercise.answerSpec.matchMode === 'regex' ? 'pattern' : exercise.answerSpec.matchMode} match,
          ignoring case and surrounding whitespace.
        </p>
      )}
    </Field>
  );
}

/* -------------------------------------------------------------------- hints */

function HintsPanel({
  slots,
  onUnlock,
  pending,
  pendingIndex
}: {
  slots: ArenaHintSlot[];
  onUnlock: (index: number) => void;
  pending: boolean;
  pendingIndex: number | null;
}) {
  if (slots.length === 0) {
    return (
      <Card>
        <InlineAlert tone="info" title="No hints for this exercise">
          The author did not attach any. The attempt history still records how many hints each attempt used.
        </InlineAlert>
      </Card>
    );
  }

  const nextLocked = slots.findIndex((slot) => !slot.unlocked);

  return (
    <Card>
      <SectionHeader
        eyebrow={`Hints (${slots.filter((slot) => slot.unlocked).length}/${slots.length} unlocked)`}
        title="Hints cost credit, not access"
        description="Each unlock is counted and the server discounts the credit on your next attempt. Nothing is hidden from your history."
      />
      <ol className="mt-3 space-y-2">
        {slots.map((slot, index) => {
          const unlocked = slot.unlocked || slot.text !== null;
          const text = slot.text ?? undefined;
          return (
            <li
              key={slot.position}
              className={
                'rounded-card border px-3 py-2.5 ' + (unlocked ? 'border-line bg-sunken' : 'border-dashed border-line-strong bg-raised')
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-caption font-medium text-ink-secondary">
                  {unlocked ? <Lightbulb size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
                  Hint {index + 1}
                </span>
                {!unlocked && index === nextLocked && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={pending && pendingIndex === index}
                    disabled={pending}
                    onClick={() => onUnlock(index)}
                  >
                    Unlock hint
                  </Button>
                )}
                {!unlocked && index !== nextLocked && (
                  <span className="text-caption text-ink-muted">Unlock the earlier hint first</span>
                )}
              </div>
              {unlocked && text && <p className="mt-1.5 text-body leading-relaxed text-ink">{text}</p>}
              {unlocked && !text && <p className="mt-1.5 text-caption text-ink-muted">Loading hint…</p>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------- result */

function ResultLabel({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === null) {
    return (
      <span className="inline-flex items-center gap-1 text-warning">
        <CircleSlash size={13} aria-hidden /> Awaiting review
      </span>
    );
  }
  return isCorrect ? (
    <span className="inline-flex items-center gap-1 text-success">
      <CheckCircle2 size={13} aria-hidden /> Correct
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-danger">
      <XCircle size={13} aria-hidden /> Incorrect
    </span>
  );
}

function ResultPanel({ result }: { result: AttemptResult }) {
  const title = result.needsReview
    ? 'Submitted for review'
    : result.isCorrect === true
      ? 'Correct'
      : 'Not correct yet';

  return (
    <Card aria-live="polite">
      <SectionHeader
        eyebrow={`Attempt ${result.attempt.attemptIndex}`}
        title={title}
        description={result.feedback}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-sunken p-3">
          <p className="text-caption text-ink-muted">Credit</p>
          <p className="mt-0.5 text-h4 font-semibold tnum text-ink">{percent(result.score)}</p>
        </div>
        <div className="rounded-card border border-line bg-sunken p-3">
          <p className="text-caption text-ink-muted">Points awarded</p>
          <p className="mt-0.5 text-h4 font-semibold tnum text-ink">
            {result.awardedPoints} / {result.maxPoints}
          </p>
        </div>
        <div className="rounded-card border border-line bg-sunken p-3">
          <p className="text-caption text-ink-muted">
            Hint discount <span className="tnum">×{result.attempt.hintDiscount}</span>
          </p>
          <p className="mt-0.5 text-caption text-ink-secondary tnum">
            {result.attempt.hintsUsed} {result.attempt.hintsUsed === 1 ? 'hint' : 'hints'} counted
          </p>
        </div>
      </div>

      {result.optionFeedback.length > 0 && (
        <ul className="mt-4 space-y-2">
          {result.optionFeedback.map((option) => (
            <li
              key={option.label}
              className={
                'rounded-card border px-3 py-2 text-caption ' +
                (option.correct
                  ? 'border-success/40 bg-success-soft'
                  : option.chosen
                    ? 'border-danger/40 bg-danger-soft'
                    : 'border-line bg-raised')
              }
            >
              <span className="inline-flex items-start gap-1.5">
                {option.correct ? (
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" aria-hidden />
                ) : option.chosen ? (
                  <XCircle size={13} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                ) : (
                  <span className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 text-ink-secondary">
                  <span className="font-mono text-ink-muted">{option.label}.</span> {option.text}
                  {option.chosen && !option.correct && <span className="text-danger"> · you picked this</span>}
                  {!option.chosen && option.correct && <span className="text-success"> · correct answer</span>}
                  {option.feedback && <span className="block mt-0.5">{option.feedback}</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.needsReview && (
        <InlineAlert tone="warning" className="mt-4" title="No automatic marking happened">
          {result.sandboxNote ??
            'This kind cannot be auto-graded, so it was stored for a human read and awarded no credit.'}
        </InlineAlert>
      )}

      {result.modelSolution && (
        <div className="mt-4">
          <Divider label="Model solution" className="mb-3" />
          <Markdown source={result.modelSolution} withIds={false} className="text-caption" />
          <p className="mt-2 text-caption text-ink-muted">
            Shown because this submission reveals the solution — which is why it earns no mastery credit.
          </p>
        </div>
      )}

      {result.explanation && (
        <div className="mt-4">
          <Divider label="Why" className="mb-3" />
          <Markdown source={result.explanation} withIds={false} className="text-caption" />
        </div>
      )}

      {result.explanation === null && !result.needsReview && (
        <p className="mt-4 text-caption text-ink-muted">
          The explanation is released once you get this right, so a retry still teaches you something.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {result.nextAction === 'next_exercise' && (
          <LinkButton to="/arena" size="sm">
            Back to the Arena
          </LinkButton>
        )}
        {result.nextAction === 'retry' && (
          <span className="inline-flex items-center gap-1.5 text-caption text-ink-secondary">
            <Sparkles size={13} aria-hidden /> Adjust your answer and submit again — retries are unlimited.
          </span>
        )}
        {result.nextAction === 'await_review' && (
          <span className="inline-flex items-center gap-1.5 text-caption text-ink-secondary">
            <Clock size={13} aria-hidden /> It is now in the review queue.
          </span>
        )}
      </div>
    </Card>
  );
}
