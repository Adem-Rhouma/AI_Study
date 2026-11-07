import { z } from 'zod';
import { ApiError } from '../../lib/http.js';

/**
 * Server-side grading only. There is no sandbox in this product: `derivation` and `code` are
 * never auto-marked. They are stored as `is_correct = NULL` and returned as "needs review", and
 * nothing here claims to run learner code.
 */

export type GradedOption = { label: string; text: string; isCorrect: boolean; feedback: string | null };

export type OptionFeedback = {
  label: string;
  text: string;
  correct: boolean;
  chosen: boolean;
  feedback: string | null;
};

export type GradeOutcome = {
  isCorrect: boolean | null;
  credit: number;
  feedback: string;
  optionFeedback: OptionFeedback[];
  needsReview: boolean;
};

export type GradeInput = {
  kind: string;
  spec: Record<string, unknown>;
  options: GradedOption[];
  answer: unknown;
};

const labelList = z.union([z.array(z.string()), z.string()]);

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]+$/, '');
}

function toLabels(raw: unknown, field: string): string[] {
  const parsed = labelList.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.unprocessable(`"${field}" must be a list of option labels or a comma-separated string.`);
  }
  const list = typeof parsed.data === 'string' ? parsed.data.split(',') : parsed.data;
  return list.map((v) => v.trim()).filter((v) => v !== '');
}

function numericValue(answer: unknown): { value: number; unit?: string } {
  if (typeof answer === 'number' || typeof answer === 'string') {
    const value = typeof answer === 'number' ? answer : Number(answer.trim().replace(/,/g, ''));
    if (!Number.isFinite(value)) throw ApiError.unprocessable('A numeric answer needs a number.');
    return { value };
  }
  const parsed = z.object({ value: z.union([z.number(), z.string()]), unit: z.string().optional() }).safeParse(answer);
  if (!parsed.success) throw ApiError.unprocessable('Numeric answers must be {value, unit?} or a number.');
  const value = typeof parsed.data.value === 'number' ? parsed.data.value : Number(String(parsed.data.value).replace(/,/g, ''));
  if (!Number.isFinite(value)) throw ApiError.unprocessable('A numeric answer needs a number.');
  return { value, unit: parsed.data.unit };
}

function truthy(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const key = normalise(value);
    if (['true', 'yes', 'correct', 'right', '1', 't'].includes(key)) return true;
    if (['false', 'no', 'incorrect', 'wrong', '0', 'f'].includes(key)) return false;
  }
  return null;
}

function optionFeedback(options: GradedOption[], chosen: string[]): OptionFeedback[] {
  return options.map((option) => ({
    label: option.label,
    text: option.text,
    correct: option.isCorrect,
    chosen: chosen.includes(normalise(option.label)) || chosen.includes(normalise(option.text)),
    feedback: option.feedback
  }));
}

function correctLabels(options: GradedOption[], spec: Record<string, unknown>): string[] {
  if (options.length > 0) return options.filter((o) => o.isCorrect).map((o) => normalise(o.label));
  const specOptions = z.array(z.object({ label: z.string().optional(), text: z.string().optional(), correct: z.boolean() })).safeParse(spec.options);
  if (specOptions.success) {
    return specOptions.data.filter((o) => o.correct).map((o) => normalise(o.label ?? o.text ?? ''));
  }
  return [];
}

function expectedFromSpec(spec: Record<string, unknown>, key: string): unknown {
  return spec[key];
}

/** Anchored, no learner flags, compiled defensively — a broken pattern is a content bug, not an RCE. */
function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

export function gradeExercise(input: GradeInput): GradeOutcome {
  const { kind, spec, options, answer } = input;

  switch (kind) {
    case 'single_choice': {
      const chosen = toLabels(answer, 'answer');
      if (chosen.length !== 1) throw ApiError.unprocessable('A single-choice answer is exactly one option label.');
      const pick = normalise(chosen[0]);
      const matched = options.find((o) => normalise(o.label) === pick || normalise(o.text) === pick);
      const expected = correctLabels(options, spec);
      if (!matched && expected.length > 0 && !expected.includes(pick)) {
        return {
          isCorrect: false,
          credit: 0,
          feedback: 'That option is not part of this exercise.',
          optionFeedback: optionFeedback(options, chosen),
          needsReview: false
        };
      }
      const isCorrect = matched ? matched.isCorrect : expected.includes(pick);
      const why = matched?.feedback ? ` ${matched.feedback}` : '';
      return {
        isCorrect,
        credit: isCorrect ? 1 : 0,
        feedback: isCorrect ? 'Correct.' : `Not quite.${why}`.trim(),
        optionFeedback: optionFeedback(options, chosen),
        needsReview: false
      };
    }

    case 'multi_choice': {
      const chosen = toLabels(answer, 'answer').map(normalise);
      if (chosen.length === 0) throw ApiError.unprocessable('Select at least one option.');
      const expected = correctLabels(options, spec);
      const hits = expected.filter((label) => chosen.includes(label)).length;
      const misses = chosen.filter((label) => !expected.includes(label)).length;
      const isCorrect = hits === expected.length && misses === 0;
      const credit = expected.length > 0 ? Math.max(0, (hits - misses) / expected.length) : 0;
      return {
        isCorrect,
        credit,
        feedback: isCorrect
          ? 'All of them, and nothing extra.'
          : `${hits} of ${expected.length} correct option(s)${misses > 0 ? `, ${misses} wrong selection(s)` : ''}.`,
        optionFeedback: optionFeedback(options, chosen),
        needsReview: false
      };
    }

    case 'true_false': {
      const answerBool = truthy(answer);
      if (answerBool === null) throw ApiError.unprocessable('A true/false answer is true or false.');
      let expectedBool = truthy(expectedFromSpec(spec, 'expected') ?? null);
      if (expectedBool === null && options.length > 0) {
        const trueOption = options.find((o) => normalise(o.label) === 'true' || normalise(o.text) === 'true');
        const falseOption = options.find((o) => normalise(o.label) === 'false' || normalise(o.text) === 'false');
        if (trueOption?.isCorrect) expectedBool = true;
        else if (falseOption?.isCorrect) expectedBool = false;
      }
      if (expectedBool === null) throw ApiError.unprocessable('This true/false exercise has no recorded answer; it needs author review.');
      const isCorrect = answerBool === expectedBool;
      return {
        isCorrect,
        credit: isCorrect ? 1 : 0,
        feedback: isCorrect ? 'Correct.' : `It is ${expectedBool ? 'true' : 'false'}.`,
        optionFeedback: [],
        needsReview: false
      };
    }

    case 'numeric': {
      const expected = Number(expectedFromSpec(spec, 'expected'));
      if (!Number.isFinite(expected)) throw ApiError.unprocessable('This numeric exercise has no expected value on record.');
      const tolerance = Math.max(0, Number(expectedFromSpec(spec, 'tolerance') ?? 0));
      const { value, unit } = numericValue(answer);
      const isCorrect = Math.abs(value - expected) <= tolerance;
      const unitNote = String(expectedFromSpec(spec, 'unit') ?? '');
      const unitMismatch = unitNote !== '' && unit !== undefined && normalise(unit) !== normalise(unitNote);
      const scaleWarning = unitMismatch ? ` You sent the unit "${unit}"; this answer is in ${unitNote}.` : '';
      return {
        isCorrect,
        credit: isCorrect ? 1 : 0,
        feedback: isCorrect
          ? `Correct: ${expected}${unitNote ? ` ${unitNote}` : ''} (±${tolerance}).${scaleWarning}`
          : `Expected ${expected}${unitNote ? ` ${unitNote}` : ''} within ±${tolerance}.${scaleWarning}`,
        optionFeedback: [],
        needsReview: false
      };
    }

    case 'short_answer':
    case 'expression': {
      const accepted = z.array(z.string()).safeParse(spec.accepted);
      if (!accepted.success || accepted.data.length === 0) {
        throw ApiError.unprocessable('This open-answer exercise has no accepted answers on record; it needs author review.');
      }
      const text = typeof answer === 'string' ? answer : String(answer ?? '');
      if (text.trim() === '') throw ApiError.unprocessable('Write an answer before submitting.');
      const mode = String(spec.matchMode ?? 'contains');
      const candidate = normalise(text);
      let isCorrect = false;
      if (mode === 'equals') isCorrect = accepted.data.some((item) => normalise(item) === candidate);
      else if (mode === 'regex') {
        isCorrect = accepted.data.some((item) => {
          const re = safeRegex(item);
          return re !== null && re.test(candidate);
        });
      } else isCorrect = accepted.data.some((item) => candidate.includes(normalise(item)));
      return {
        isCorrect,
        credit: isCorrect ? 1 : 0,
        feedback: isCorrect ? 'Correct.' : 'Not matched. Check the exact form the question asks for.',
        optionFeedback: [],
        needsReview: false
      };
    }

    case 'match': {
      const pairs = z.array(z.object({ left: z.string(), right: z.string() })).safeParse(spec.pairs);
      if (!pairs.success || pairs.data.length === 0) {
        throw ApiError.unprocessable('This matching exercise has no pairs on record; it needs author review.');
      }
      const given = z
        .union([z.array(z.object({ left: z.string(), right: z.string() })), z.record(z.string(), z.string())])
        .safeParse(answer);
      if (!given.success) throw ApiError.unprocessable('A match answer is [{left, right}] or {left: right}.');
      const entries: [string, string][] = Array.isArray(given.data)
        ? given.data.map((pair) => [pair.left, pair.right] as [string, string])
        : Object.entries(given.data);
      const lookup = new Map(entries.map(([left, right]) => [normalise(left), normalise(right)]));
      const hits = pairs.data.filter((pair) => lookup.get(normalise(pair.left)) === normalise(pair.right)).length;
      const isCorrect = hits === pairs.data.length;
      return {
        isCorrect,
        credit: pairs.data.length > 0 ? hits / pairs.data.length : 0,
        feedback: isCorrect ? 'Every pair matched.' : `${hits} of ${pairs.data.length} pairs matched.`,
        optionFeedback: [],
        needsReview: false
      };
    }

    case 'derivation':
    case 'code': {
      const text = typeof answer === 'string' ? answer : String(answer ?? '');
      if (text.trim() === '') throw ApiError.unprocessable('Write your work before submitting.');
      return {
        isCorrect: null,
        credit: 0,
        needsReview: true,
        optionFeedback: [],
        feedback:
          kind === 'code'
            ? 'Submitted for review. The Arena has no code sandbox: your code was stored as text and was never executed.'
            : 'Submitted for review. A derivation cannot be auto-graded — it is stored and waiting for a human read.'
      };
    }

    default:
      throw ApiError.unprocessable(`Unknown exercise kind "${kind}".`);
  }
}
