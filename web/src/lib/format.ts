import type { Difficulty, MasteryLevel } from '../api/types';

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours} h ${rest} m` : `${hours} h`;
}

export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} d ago`;
  return formatDate(iso);
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function excerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  introductory: 'Introductory',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert'
};

export const DIFFICULTY_ORDER: Difficulty[] = ['introductory', 'beginner', 'intermediate', 'advanced', 'expert'];

/** Difficulty is encoded with fill level as well as hue, so it survives greyscale and colour-blind viewing. */
export const DIFFICULTY_BARS: Record<Difficulty, number> = {
  introductory: 1,
  beginner: 2,
  intermediate: 3,
  advanced: 4,
  expert: 5
};

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  new: 'New',
  exposed: 'Exposed',
  learning: 'Learning',
  practising: 'Practising',
  proficient: 'Proficient',
  mastered: 'Mastered'
};

export const MASTERY_ORDER: MasteryLevel[] = [
  'new',
  'exposed',
  'learning',
  'practising',
  'proficient',
  'mastered'
];

/** Token name for the mastery ramp; always rendered together with a fill pattern and the text label. */
export const MASTERY_COLOR: Record<MasteryLevel, string> = {
  new: 'var(--mastery-0)',
  exposed: 'var(--mastery-1)',
  learning: 'var(--mastery-2)',
  practising: 'var(--mastery-3)',
  proficient: 'var(--mastery-4)',
  mastered: 'var(--mastery-5)'
};

export const RELATION_LABEL: Record<string, string> = {
  strict: 'Requires',
  recommended: 'Helpful before',
  related: 'Related to',
  extension: 'Leads to'
};

/** Human-readable names for the nine graded exercise kinds; `derivation` and `code` are review-only. */
export const EXERCISE_KIND_LABEL: Record<string, string> = {
  single_choice: 'Single choice',
  multi_choice: 'Multiple choice',
  true_false: 'True / false',
  numeric: 'Numeric',
  short_answer: 'Short answer',
  expression: 'Expression',
  derivation: 'Derivation',
  code: 'Code',
  match: 'Matching'
};

export const EXERCISE_KIND_ORDER = [
  'single_choice',
  'multi_choice',
  'true_false',
  'numeric',
  'short_answer',
  'expression',
  'derivation',
  'code',
  'match'
];

/** Review-only kinds are never marked right or wrong by the server — they wait for a human read. */
export const REVIEW_ONLY_KINDS = ['derivation', 'code'];

export function exerciseKindLabel(kind: string): string {
  return EXERCISE_KIND_LABEL[kind] ?? kind;
}

/** Display names for the thirteen library resource types. */
export const RESOURCE_TYPE_LABEL: Record<string, string> = {
  paper: 'Paper',
  book: 'Book',
  survey: 'Survey',
  course: 'Course',
  video: 'Video',
  docs: 'Documentation',
  repository: 'Repository',
  tutorial: 'Tutorial',
  dataset: 'Dataset',
  tool: 'Tool',
  'lecture-notes': 'Lecture notes',
  blog: 'Blog',
  standard: 'Standard'
};

export function resourceTypeLabel(type: string): string {
  return RESOURCE_TYPE_LABEL[type] ?? type;
}

export const RESOURCE_TYPE_ORDER = Object.keys(RESOURCE_TYPE_LABEL);

/**
 * Curated milestones keep the precision the editor had: "2012", "2012-06" or a full date.
 * Padding it into a full date would claim knowledge we do not have, so render only what is there.
 */
export function formatPartialDate(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length === 4) return value;
  const [year, month] = value.split('-').map(Number);
  if (value.length === 7 && year && month) {
    return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, month - 1, 1))
    );
  }
  return formatDate(value);
}

export const MILESTONE_KIND_LABEL: Record<string, string> = {
  paper: 'Paper',
  model: 'Model',
  product: 'Product',
  dataset: 'Dataset',
  standard: 'Standard',
  event: 'Event',
  development: 'Development'
};

export function milestoneKindLabel(kind: string): string {
  return MILESTONE_KIND_LABEL[kind] ?? kind;
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  competition: 'Competition',
  challenge: 'Challenge',
  hackathon: 'Hackathon',
  conference: 'Conference',
  workshop: 'Workshop',
  grant: 'Grant',
  summit: 'Summit'
};

export const EVENT_TYPE_ORDER = Object.keys(EVENT_TYPE_LABEL);

export const EVENT_STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  open: 'Open now',
  ongoing: 'Ongoing',
  closed: 'Closed',
  recurring: 'Recurring'
};

export const EVENT_STATUS_ORDER = Object.keys(EVENT_STATUS_LABEL);

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABEL[type] ?? type;
}

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABEL[status] ?? status;
}

/** Open/recurring entries read as "live" and closed ones as muted; never colour alone. */
export function eventStatusTone(status: string): 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 'open') return 'success';
  if (status === 'ongoing') return 'info';
  if (status === 'upcoming') return 'accent';
  if (status === 'closed') return 'neutral';
  return 'neutral';
}
