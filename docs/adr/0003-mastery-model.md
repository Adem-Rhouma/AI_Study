# ADR-0003 — Topic mastery model

Status: adopted. Decided by the project lead before implementation so that the UI, the API and
the exercise loop all read from one definition.

## What mastery is for

Mastery answers one question for the learner: *"can I rely on this topic right now, and what
would make me more certain?"* It is not a score to maximise and it is deliberately not
convertible into points, streak-based status, or a leaderboard currency.

## Signals (only these three feed the score)

| component | source | range |
|---|---|---|
| `coverage` | fraction of the topic's published lessons the learner has completed | 0..1 |
| `performance` | hint-discounted exercise correctness, exponentially weighted toward recent attempts | 0..1 |
| `retention` | recency of last meaningful touch, `exp(-days / 45)` | 0..1 |

```
score = 0.45 * coverage + 0.45 * performance + 0.10 * retention
```

Rules with reasons:

1. **Hints discount performance.** An attempt that consumed the *n*-th hint is credited
   `max(0, 1 - 0.2n)`. Solving unaided is worth measurably more than solving with the answer
   ladder open; this is why there is no separate "show solution" button in the Arena.
2. **Viewing a solution credits nothing.** A `solution_viewed` attempt is recorded for history
   and contributes 0 to `performance`. It also raises a revalidation flag, because the most
   common failure mode of self-study is mistaking re-reading for recalling.
3. **No passive decay of the score.** `retention` is capped at a 10% weight so that time alone
   cannot erase demonstrated ability, and cannot add to it either (a learner who does nothing
   for 60 days loses at most ~0.07). Instead, staleness produces an explicit *revalidation
   suggestion* when `days_since_touch > 90` and `level < proficient`. Decay that silently
   demotes a learner is demotivating and unexplainable; decay that asks for a five-minute
   recheck is actionable.
4. **Time-on-task is recorded but never scored.** Minutes read are stored in `activity_log` for
   the dashboard's activity view only. Reading time is the easiest signal to fake and the worst
   proxy for understanding.
5. **Opening a lesson is not completing it.** `coverage` counts rows in `lesson_completions`,
   which are only written by an explicit learner action or by passing an embedded quiz.

## Levels

Derived from the score plus evidence counts, so a level always has a defensible reason:

| level | condition |
|---|---|
| `new` | no completion, no attempt |
| `exposed` | any lesson completed or any attempt made |
| `learning` | `coverage >= 0.5` |
| `practising` | `attempts >= 3` and `score >= 0.35` |
| `proficient` | `score >= 0.65`, `coverage >= 0.5`, `attempts >= 5` |
| `mastered` | `score >= 0.85`, `coverage = 1`, `attempts >= 8`, and last touch within 180 days |

Thresholds on `attempts` exist so a single lucky quiz cannot mint a `mastered` badge.

## Explainability requirement

`topic_mastery` stores `coverage`, `performance`, `retention`, `score`, `attempts`,
`lessons_done` and `last_touched_at`. The topic and progress UIs must be able to render "why
this level" from those columns alone, without recomputation. This is checked by an API test.

## Aggregation

Course, path and dashboard rollups are weighted means of topic scores by topic
`est_minutes`, and are never stored — they are derived on read, from the same components, so
there is exactly one source of truth.

## Known limitations

- `coverage` is a proxy: lesson completion is self-attested. Mitigated by requiring exercise
  evidence for `proficient` and above.
- Topics without lessons or exercises stay at `new` forever. Correct, and visible in the admin
  content-integrity report so the gap is a content bug we can see.
