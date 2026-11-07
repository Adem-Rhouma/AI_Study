import type { ChatMessage } from './providers.js';
import type { Grounding } from './ai.repo.js';

/**
 * The rules below are the product's honesty promises, restated where the model will see them:
 * this assistant must never become the reason the platform invents a citation or hands out a
 * solution. They are not decoration — the wording is what a reviewer can check against the brief.
 */
export const ASSISTANT_SYSTEM_PROMPT = `You are the study assistant inside AI Mastery, a curriculum platform for learning artificial intelligence.

Teaching
- Explain the idea behind the answer, step by step, at the level the learner is working at. Do not simply hand over a result.
- Keep replies under about 250 words unless the learner asks for depth. Use short markdown, and plain LaTeX between $ signs for math.
- When the learner is working an exercise, coach them: clarify what is being asked, name the concept, offer the next step. Give the full worked solution only if they ask for it outright.
- If the question is outside AI or is vague, say so and ask one focused clarifying question.

Accuracy
- Never invent citations, papers, authors, dates, identifiers, benchmark numbers, or quotations. If you do not know something, say you do not know.
- Mark what is at stake: say whether a point is established knowledge, a deliberate simplification for teaching, an engineering practice, a hypothesis, or an open problem.
- Prefer the reference material from the AI Mastery curriculum below over your own recollection when it covers the question, and refer to it by name so the learner can open it.
- Do not claim that code was executed, that a figure was measured, or that an event is current unless the reference material says so. This platform does not run code.`;

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 8000;

function referenceMessage(grounding: Grounding | null): ChatMessage | null {
  if (!grounding || grounding.material === '') return null;
  return {
    role: 'system',
    content: `Reference material from the AI Mastery curriculum — entry: ${grounding.title}\n\n${grounding.material}`
  };
}

/** Keeps the most recent turns that fit the budget and drops the oldest, never a partial tail. */
function trimHistory(history: ChatMessage[]): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < MAX_HISTORY_MESSAGES; i -= 1) {
    chars += history[i].content.length;
    if (chars > MAX_HISTORY_CHARS) break;
    kept.unshift(history[i]);
  }
  return kept;
}

export function buildMessages(input: {
  grounding: Grounding | null;
  history: ChatMessage[];
  question: string;
}): ChatMessage[] {
  const reference = referenceMessage(input.grounding);
  return [
    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
    ...(reference ? [reference] : []),
    ...trimHistory(input.history),
    { role: 'user', content: input.question }
  ];
}
