import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as RadixTabs from '@radix-ui/react-tabs';
import { BookOpenCheck, ExternalLink, Lightbulb, Quote } from 'lucide-react';
import type { ReaderBlock, ReaderExercise } from '../../api/types';
import { cn } from '../../lib/cn';
import { DifficultyChip } from '../ui/Chip';
import { Markdown } from './Markdown';
import { TeX } from './Math';
import { CodeBlock } from './CodeBlock';
import { Interactive } from './Interactives';

/* Payload helpers: content is authored in-house, but a missing key must degrade, never crash. */

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function num(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function bool(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

function arr(payload: Record<string, unknown>, key: string): unknown[] {
  const value = payload[key];
  return Array.isArray(value) ? value : [];
}

function strArr(payload: Record<string, unknown>, key: string): string[] {
  return arr(payload, key).filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function objArr(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return arr(payload, key).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
}

function bulletItems(block: ReaderBlock): string[] {
  const fromPayload = strArr(block.payload, 'items');
  if (fromPayload.length > 0) return fromPayload;
  return block.text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
    .filter((line) => line !== '');
}

/* ------------------------------------------------------------------ blocks */

function Callout({ variant = 'note', label, children }: { variant?: string; label?: string; children: ReactNode }) {
  const defaults: Record<string, string> = {
    note: 'Note',
    warning: 'Warning',
    danger: 'Careful',
    info: 'Context',
    success: 'Takeaway',
    pitfall: 'Common pitfall',
    'key-idea': 'Key idea',
    definition: 'Definition',
    theorem: 'Theorem',
    proof: 'Proof'
  };
  return (
    <div className={cn('callout', variant)}>
      <span className="callout-label">{label ?? defaults[variant] ?? 'Note'}</span>
      <div className="callout-body">{children}</div>
    </div>
  );
}

function ExerciseCard({ exercise }: { exercise: ReaderExercise }) {
  return (
    <aside className="rounded-card border border-line bg-raised p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-pill bg-accent-soft text-accent-hover">
          <BookOpenCheck size={15} aria-hidden />
        </span>
        <h4 className="font-sans text-small-title font-semibold text-ink">{exercise.title}</h4>
        <DifficultyChip difficulty={exercise.difficulty} />
        <span className="tnum ml-auto text-caption text-ink-muted">{exercise.points} pts</span>
      </div>
      {exercise.context && <Markdown source={exercise.context} className="mt-2 font-sans text-caption" />}
      <Markdown source={exercise.prompt} className="mt-2" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          to={`/arena/${exercise.slug}`}
          className="inline-flex items-center gap-1.5 rounded-input bg-accent px-3 py-1.5 font-sans text-caption font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Open in Problem Arena
          <ExternalLink size={13} aria-hidden />
        </Link>
        <span className="inline-flex items-center gap-1.5 font-sans text-caption text-ink-muted">
          <Lightbulb size={13} aria-hidden />
          {exercise.hintCount} tiered hint{exercise.hintCount === 1 ? '' : 's'} available
        </span>
      </div>
      {exercise.options.length > 0 && (
        <p className="mt-3 font-sans text-caption text-ink-muted">
          Grading happens in the Arena so the answer key is never shipped to the browser.
        </p>
      )}
    </aside>
  );
}

type QuizQuestion = { prompt: string; options: string[]; answerIndex?: number; explain?: string };

function SelfCheck({ questions }: { questions: QuizQuestion[] }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div key={index} className="rounded-card border border-line bg-raised p-4">
          <p className="font-sans text-body font-medium text-ink">{question.prompt}</p>
          <ul className="mt-2 space-y-1.5">
            {question.options.map((option, optionIndex) => {
              const selected = picked[index] === optionIndex;
              const showAnswer = revealed[index] === true && question.answerIndex === optionIndex;
              return (
                <li key={optionIndex}>
                  <button
                    type="button"
                    onClick={() => setPicked((current) => ({ ...current, [index]: optionIndex }))}
                    aria-pressed={selected}
                    className={cn(
                      'w-full cursor-pointer rounded-input border px-3 py-1.5 text-left font-sans text-caption transition-colors',
                      showAnswer
                        ? 'border-success bg-success-soft text-ink'
                        : selected
                          ? 'border-accent bg-accent-soft text-ink'
                          : 'border-line text-ink-secondary hover:border-[var(--border-strong)] hover:text-ink'
                    )}
                  >
                    {option}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRevealed((current) => ({ ...current, [index]: !current[index] }))}
              className="cursor-pointer font-sans text-caption font-medium text-accent hover:underline"
            >
              {revealed[index] ? 'Hide answer' : 'Check answer'}
            </button>
            <span className="font-sans text-caption text-ink-muted">Self-check — not graded</span>
          </div>
          {revealed[index] && question.explain && (
            <p className="mt-2 border-t border-line pt-2 font-sans text-caption text-ink-secondary">{question.explain}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Checklist({ storageKey, items }: { storageKey: string; items: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as number[];
        setChecked(items.map((_, index) => saved.includes(index)));
      } else {
        setChecked(items.map(() => false));
      }
    } catch {
      setChecked(items.map(() => false));
    }
  }, [storageKey, items]);

  const done = checked.filter(Boolean).length;

  return (
    <div className="rounded-card border border-line bg-raised p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-sans text-small-title font-semibold text-ink">Can you do these?</h4>
        <span className="tnum font-sans text-caption text-ink-muted">
          {done}/{items.length}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={index}>
            <label className="flex cursor-pointer items-start gap-2.5 font-sans text-caption">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                checked={checked[index] ?? false}
                onChange={() => {
                  const next = checked.map((value, position) => (position === index ? !value : value));
                  setChecked(next);
                  try {
                    localStorage.setItem(storageKey, JSON.stringify(next.map((value, position) => (value ? position : -1)).filter((position) => position >= 0)));
                  } catch {
                    /* private browsing: the checklist simply will not persist */
                  }
                }}
              />
              <span className={cn('text-ink-secondary', checked[index] && 'text-ink-muted line-through')}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders one lesson block. Unknown types fall back to prose so a new type never blanks a lesson. */
export function BlockRenderer({ block, storageKey }: { block: ReaderBlock; storageKey: string }) {
  const { type, text, payload } = block;

  switch (type) {
    case 'heading': {
      const level = num(payload, 'level') ?? 2;
      const id = str(payload, 'id') || undefined;
      const className = 'font-sans font-semibold tracking-tight text-ink';
      if (level >= 4) return <h4 id={id} className={cn(className, 'text-h4 mt-6')}>{text}</h4>;
      if (level === 3) return <h3 id={id} className={cn(className, 'text-h3 mt-8')}>{text}</h3>;
      return <h2 id={id} className={cn(className, 'text-h2 mt-10')}>{text}</h2>;
    }

    case 'prose':
      return <Markdown source={text} />;

    case 'list': {
      const items = bulletItems(block);
      if (items.length === 0) return null;
      const Tag = bool(payload, 'ordered') ? 'ol' : 'ul';
      return (
        <Tag className="prose list-disc space-y-1.5 pl-5 text-body">
          {items.map((item, index) => (
            <li key={index}>
              <Markdown source={item} className="inline max-w-none text-body" />
            </li>
          ))}
        </Tag>
      );
    }

    case 'callout':
      return (
        <Callout variant={str(payload, 'variant') || 'note'} label={str(payload, 'label') || undefined}>
          <Markdown source={text} />
        </Callout>
      );

    case 'math': {
      const latex = str(payload, 'latex') || text;
      if (!latex) return null;
      return (
        <div>
          <TeX latex={latex} display={payload.display !== false} label={str(payload, 'label') || undefined} />
          {str(payload, 'note') && <p className="mt-2 font-sans text-caption text-ink-secondary">{str(payload, 'note')}</p>}
        </div>
      );
    }

    case 'derivation': {
      const steps = objArr(payload, 'steps');
      return (
        <div className="rounded-card border border-line bg-raised p-4">
          {str(payload, 'title') && (
            <h4 className="font-sans text-small-title font-semibold text-ink">{str(payload, 'title')}</h4>
          )}
          <ol className="mt-2 space-y-3">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="tnum mt-0.5 grid size-6 shrink-0 place-items-center rounded-pill bg-accent-soft font-sans text-caption font-semibold text-accent-hover">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {str(step, 'text') && <Markdown source={str(step, 'text')} />}
                  {str(step, 'latex') && <TeX latex={str(step, 'latex')} display />}
                  {str(step, 'note') && (
                    <p className="mt-1 font-sans text-caption text-ink-muted">{str(step, 'note')}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {str(payload, 'conclusion') && (
            <div className="mt-3 border-t border-line pt-3">
              <Markdown source={str(payload, 'conclusion')} />
            </div>
          )}
        </div>
      );
    }

    case 'worked_example': {
      const steps = strArr(payload, 'steps');
      return (
        <div className="rounded-card border border-line bg-raised p-4">
          <span className="eyebrow font-sans text-caption">Worked example</span>
          {str(payload, 'problem') && <Markdown source={str(payload, 'problem')} className="mt-1" />}
          <div className="mt-3 space-y-3">
            {steps.map((step, index) => (
              <div key={index} className="border-l-2 border-line pl-3">
                <Markdown source={step} />
              </div>
            ))}
          </div>
          {str(payload, 'answer') && (
            <div className="mt-3">
              <Callout variant="success" label="Answer">
                <Markdown source={str(payload, 'answer')} />
              </Callout>
            </div>
          )}
          {str(payload, 'note') && <p className="font-sans text-caption text-ink-muted">{str(payload, 'note')}</p>}
        </div>
      );
    }

    case 'definition':
      return (
        <Callout variant="definition" label={str(payload, 'term') ? `Definition — ${str(payload, 'term')}` : undefined}>
          {str(payload, 'notation') && (
            <p className="mb-1 font-sans text-caption text-ink-muted">
              Notation: <TeX latex={str(payload, 'notation')} />
            </p>
          )}
          <Markdown source={text} />
        </Callout>
      );

    case 'theorem': {
      const statement = str(payload, 'statement') || text;
      const proof = str(payload, 'proof');
      return (
        <Callout
          variant="theorem"
          label={[str(payload, 'number') && `Theorem ${str(payload, 'number')}`, str(payload, 'name')]
            .filter(Boolean)
            .join(' · ') || 'Theorem'}
        >
          <Markdown source={statement} />
          {proof && (
            <details className="proof-toggle mt-3">
              <summary>{str(payload, 'proofLabel') || 'Show proof'}</summary>
              <div className="mt-2 border-l-2 border-line pl-3">
                <Markdown source={proof} />
              </div>
            </details>
          )}
        </Callout>
      );
    }

    case 'code':
      return (
        <CodeBlock
          code={text}
          language={str(payload, 'language') || undefined}
          filename={str(payload, 'filename') || undefined}
          caption={str(payload, 'caption') || undefined}
          highlightLines={arr(payload, 'highlightLines').filter((n): n is number => typeof n === 'number')}
        />
      );

    case 'exercise':
      return block.exercise ? <ExerciseCard exercise={block.exercise} /> : null;

    case 'quiz': {
      const questions = objArr(payload, 'questions').map<QuizQuestion>((question) => ({
        prompt: str(question, 'prompt'),
        options: strArr(question, 'options'),
        ...(typeof question.answerIndex === 'number' ? { answerIndex: question.answerIndex } : {}),
        ...(str(question, 'explain') ? { explain: str(question, 'explain') } : {})
      }));
      if (questions.length === 0 && block.exercise) return <ExerciseCard exercise={block.exercise} />;
      if (questions.length === 0) return null;
      return (
        <div>
          <span className="eyebrow mb-2 block font-sans text-caption">Quick check</span>
          <SelfCheck questions={questions} />
        </div>
      );
    }

    case 'image': {
      const src = str(payload, 'src');
      if (!src) return null;
      return (
        <figure className="figure">
          <div className="figure-body">
            <img src={src} alt={str(payload, 'alt') || str(payload, 'caption') || ''} className="mx-auto rounded-input" loading="lazy" />
          </div>
          {str(payload, 'tryIt') && (
            <div className="try-strip">
              <span>Try it</span>
              <span>{str(payload, 'tryIt')}</span>
            </div>
          )}
          {(str(payload, 'caption') || str(payload, 'credit')) && (
            <figcaption>
              {str(payload, 'caption')}
              {str(payload, 'credit') && <span className="text-ink-muted"> · {str(payload, 'credit')}</span>}
            </figcaption>
          )}
        </figure>
      );
    }

    case 'table': {
      const columns = strArr(payload, 'columns');
      const rows = arr(payload, 'rows') as (string | number)[][];
      if (columns.length === 0 || rows.length === 0) return null;
      return (
        <figure>
          <div className="table-scroll rounded-card border border-line">
            <table className="w-full border-collapse font-sans text-caption">
              <thead>
                <tr>
                  {columns.map((column, index) => (
                    <th key={index} scope="col" className="border-b border-line-strong bg-sunken px-3 py-2 text-left font-semibold text-ink-secondary">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-[var(--border-subtle)] last:border-0">
                    {columns.map((_, cellIndex) => {
                      const value = row[cellIndex];
                      const numeric = typeof value === 'number';
                      return (
                        <td key={cellIndex} className={cn('px-3 py-2 text-ink-secondary', numeric && 'tnum text-right')}>
                          {value === undefined || value === null ? '—' : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {str(payload, 'caption') && <figcaption className="mt-2 font-sans text-caption text-ink-muted">{str(payload, 'caption')}</figcaption>}
        </figure>
      );
    }

    case 'quote':
      return (
        <blockquote className="rounded-card border-l-3 border-accent bg-sunken px-4 py-3">
          <div className="flex gap-2">
            <Quote size={16} className="mt-1 shrink-0 text-ink-muted" aria-hidden />
            <div className="min-w-0">
              <Markdown source={text} />
              {(str(payload, 'author') || str(payload, 'source')) && (
                <cite className="mt-2 block font-sans text-caption not-italic text-ink-muted">
                  {[str(payload, 'author'), str(payload, 'year'), str(payload, 'source')].filter(Boolean).join(' · ')}
                  {str(payload, 'url') && (
                    <a href={str(payload, 'url')} target="_blank" rel="noopener noreferrer" className="ml-1 text-accent">
                      source
                    </a>
                  )}
                </cite>
              )}
            </div>
          </div>
        </blockquote>
      );

    case 'interactive':
      return <Interactive kind={str(payload, 'kind')} config={(payload.config as Record<string, unknown>) ?? {}} />;

    case 'comparison': {
      const items = objArr(payload, 'items');
      if (items.length === 0) return null;
      return (
        <div>
          <div className={cn('grid gap-3', items.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2')}>
            {items.map((item, index) => (
              <div key={index} className="rounded-card border border-line bg-raised p-4">
                <h4 className="font-sans text-small-title font-semibold text-ink">{str(item, 'title')}</h4>
                {str(item, 'summary') && <p className="mt-1 font-sans text-caption text-ink-secondary">{str(item, 'summary')}</p>}
                <ul className="mt-2 space-y-1.5 pl-4 font-sans text-caption text-ink-secondary">
                  {strArr(item, 'points').map((point, pointIndex) => (
                    <li key={pointIndex} className="list-disc">
                      <Markdown source={point} className="inline max-w-none font-sans text-caption" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {str(payload, 'caption') && <p className="mt-2 font-sans text-caption text-ink-muted">{str(payload, 'caption')}</p>}
        </div>
      );
    }

    case 'timeline': {
      const events = objArr(payload, 'events');
      if (events.length === 0) return null;
      return (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {events.map((event, index) => (
            <li key={index} className="relative">
              <span aria-hidden className="absolute -left-[26px] top-1.5 size-2.5 rounded-pill border-2 border-raised bg-accent" />
              <p className="tnum font-sans text-caption font-semibold text-accent-hover">{str(event, 'date')}</p>
              <p className="font-sans text-body font-medium text-ink">{str(event, 'title')}</p>
              {str(event, 'text') && <Markdown source={str(event, 'text')} className="mt-1" />}
            </li>
          ))}
        </ol>
      );
    }

    case 'reference': {
      const title = str(payload, 'title') || text;
      if (!title) return null;
      return (
        <div className="flex gap-3 rounded-card border border-line bg-raised px-4 py-3">
          <span className="mt-0.5 shrink-0 text-ink-muted">
            <BookOpenCheck size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-sans text-body font-medium text-ink">
              {str(payload, 'url') ? (
                <a href={str(payload, 'url')} target="_blank" rel="noopener noreferrer">
                  {title}
                </a>
              ) : (
                title
              )}
            </p>
            <p className="mt-0.5 font-sans text-caption text-ink-muted">
              {[str(payload, 'authors'), str(payload, 'year'), str(payload, 'type')].filter(Boolean).join(' · ')}
            </p>
            {str(payload, 'note') && <p className="mt-1 font-sans text-caption text-ink-secondary">{str(payload, 'note')}</p>}
          </div>
        </div>
      );
    }

    case 'checklist': {
      const items = bulletItems(block);
      if (items.length === 0) return null;
      return <Checklist storageKey={`${storageKey}:checklist:${block.index}`} items={items} />;
    }

    case 'tabs': {
      const tabs = objArr(payload, 'tabs');
      if (tabs.length === 0) return null;
      const first = str(tabs[0], 'label') || 'Tab 1';
      return (
        <RadixTabs.Root defaultValue={first} className="rounded-card border border-line bg-raised">
          <RadixTabs.List className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2">
            {tabs.map((tab, index) => {
              const label = str(tab, 'label') || `Tab ${index + 1}`;
              return (
                <RadixTabs.Trigger
                  key={label}
                  value={label}
                  className="-mb-px cursor-pointer whitespace-nowrap border-b-2 border-transparent px-3 py-2 font-sans text-caption font-medium text-ink-secondary transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink"
                >
                  {label}
                </RadixTabs.Trigger>
              );
            })}
          </RadixTabs.List>
          {tabs.map((tab, index) => {
            const label = str(tab, 'label') || `Tab ${index + 1}`;
            return (
              <RadixTabs.Content key={label} value={label} className="p-4 outline-none">
                <Markdown source={str(tab, 'markdown') || str(tab, 'text')} />
              </RadixTabs.Content>
            );
          })}
        </RadixTabs.Root>
      );
    }

    default:
      return text ? <Markdown source={text} /> : null;
  }
}
