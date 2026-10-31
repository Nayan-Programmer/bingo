// Pure game logic for Spin & Solve — no React, no I/O, fully unit-testable.

export interface Student {
  id: string;
  name: string;
  is_sample: boolean;
  eligible: boolean;
  created_at: string;
}

export interface Question {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  is_sample: boolean;
  /** Which quiz round asks this question. */
  round: 1 | 2;
  created_at: string;
}

export interface GameSettings {
  seconds_per_question: number;
  points_per_correct: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  seconds_per_question: 30,
  points_per_correct: 10,
};

/** One student's result for one round. `timeMs` is the time they used for the whole question set. */
export interface StudentScore {
  correct: number;
  incorrect: number;
  /** Questions left unanswered when the clock ran out. */
  skipped: number;
  points: number;
  timeMs: number;
}

export const emptyScore = (): StudentScore => ({
  correct: 0,
  incorrect: 0,
  skipped: 0,
  points: 0,
  timeMs: 0,
});

export interface RoundConfig {
  round: 1 | 2;
  label: string;
  questionsPerStudent: number;
  /** One shared clock for the whole question set, not per question. */
  secondsPerStudent: number;
  /** How many top students move on after this round (null = last round). */
  advanceCount: number | null;
}

export const ROUNDS: readonly RoundConfig[] = [
  { round: 1, label: "Round 1", questionsPerStudent: 5, secondsPerStudent: 90, advanceCount: 10 },
  { round: 2, label: "Round 2", questionsPerStudent: 5, secondsPerStudent: 60, advanceCount: null },
];

/** Finish every question in under this long to earn the celebration video + sound. */
export const CELEBRATION_UNDER_MS = 50_000;
/** Raise this if the celebration should also require some correct answers. */
export const CELEBRATION_MIN_CORRECT = 0;

export function earnedCelebration(score: StudentScore): boolean {
  return (
    score.skipped === 0 &&
    score.timeMs < CELEBRATION_UNDER_MS &&
    score.correct >= CELEBRATION_MIN_CORRECT
  );
}

export type CelebrationKind = "fast" | "steady";

/**
 * Which video a finished turn earns:
 *  - "fast"   every question answered in under 50 s  → public/aura-of-pi.mp4
 *  - "steady" every question answered, 50 s or more  → public/steady-finish.mp4
 *  - null     the clock ran out with questions left  → no video
 */
export function celebrationKind(score: StudentScore): CelebrationKind | null {
  if (earnedCelebration(score)) return "fast";
  if (score.skipped === 0) return "steady";
  return null;
}

/** A student needs at least this many correct answers to move on ("pass" the round). */
export const MIN_CORRECT_TO_ADVANCE = 1;

/** The questions that belong to one round (Round 1 and Round 2 each have their own set). */
export function questionsForRound(pool: readonly Question[], round: 1 | 2): Question[] {
  return pool.filter((q) => (q.round ?? 1) === round);
}

/** Rounds that don't have enough of their own questions for a full turn, e.g. [{round: 2, have: 3, need: 5}]. */
export function roundsShortOfQuestions(
  pool: readonly Question[],
): { round: 1 | 2; have: number; need: number }[] {
  return ROUNDS.map((r) => ({
    round: r.round,
    have: questionsForRound(pool, r.round).length,
    need: r.questionsPerStudent,
  })).filter((r) => r.have < r.need);
}

/** `count` distinct random questions for one student's turn. */
export function pickQuestionSet(pool: Question[], count: number): Question[] {
  return shuffle(pool).slice(0, count);
}

/**
 * Deal one student's questions from a shuffled deck, like cards: no question is given to two
 * students until every question in the round has been used. When the deck runs low it is
 * reshuffled from the full pool, never repeating a question inside the same hand.
 * Returns the hand and the deck that is left for the next student.
 */
export function dealFromDeck(
  deck: readonly Question[],
  pool: readonly Question[],
  count: number,
): { hand: Question[]; deck: Question[] } {
  const hand: Question[] = deck.slice(0, count);
  let rest = deck.slice(count);
  if (hand.length < count) {
    const inHand = new Set(hand.map((q) => q.id));
    const refill = shuffle(pool.filter((q) => !inHand.has(q.id)));
    const need = count - hand.length;
    hand.push(...refill.slice(0, need));
    // Whatever wasn't dealt starts the next deck; the hand's own questions go to the back.
    rest = [...refill.slice(need), ...shuffle(hand)];
  }
  return { hand, deck: rest };
}

/** How many students can play a round before any question has to repeat. */
export function studentsWithoutRepeats(poolSize: number, perStudent: number): number {
  return perStudent > 0 ? Math.floor(poolSize / perStudent) : 0;
}

/** Result of one finished turn. Unanswered questions count as skipped and cost the full clock. */
export function scoreTurn(
  questions: readonly Question[],
  answers: readonly (number | null)[],
  elapsedMs: number,
  pointsPerCorrect: number,
): StudentScore {
  const score = emptyScore();
  questions.forEach((q, i) => {
    const choice = answers[i] ?? null;
    if (choice === null) score.skipped += 1;
    else if (isAnswerCorrect(q, choice)) score.correct += 1;
    else score.incorrect += 1;
  });
  score.points = score.correct * pointsPerCorrect;
  score.timeMs = Math.max(0, Math.round(elapsedMs));
  return score;
}

export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Pick a random question that hasn't been used this session. When every
 * question has been used (fewer questions than turns), the pool resets but the
 * immediately previous question is still avoided when at least 2 exist.
 */
export function pickQuestion(
  pool: Question[],
  usedIds: ReadonlySet<string>,
  lastQuestionId: string | null,
): Question {
  if (pool.length === 0) throw new Error("Question pool is empty");
  let candidates = pool.filter((q) => !usedIds.has(q.id) && q.id !== lastQuestionId);
  if (candidates.length === 0) candidates = pool.filter((q) => q.id !== lastQuestionId);
  if (candidates.length === 0) candidates = pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  if (!picked) throw new Error("Failed to pick a question");
  return picked;
}

export function isAnswerCorrect(question: Question, selectedIndex: number | null): boolean {
  return selectedIndex !== null && selectedIndex === question.correct_index;
}

/** Accuracy is correct answers out of every question asked — unanswered ones count against it. */
export function accuracy(score: StudentScore): number {
  const asked = score.correct + score.incorrect + score.skipped;
  if (asked === 0) return 0;
  return Math.round((score.correct / asked) * 100);
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export interface LeaderboardRow {
  rank: number;
  student: Student;
  score: StudentScore;
}

/** Rank by accuracy (most correct), then least time used, then name; exact ties share a rank. */
export function buildLeaderboard(
  students: Student[],
  scores: Record<string, StudentScore>,
): LeaderboardRow[] {
  const rows = students
    .map((student) => ({ student, score: scores[student.id] ?? emptyScore() }))
    .sort(
      (a, b) =>
        b.score.correct - a.score.correct ||
        a.score.timeMs - b.score.timeMs ||
        a.student.name.localeCompare(b.student.name),
    );

  let rank = 0;
  let prev: { correct: number; timeMs: number } | null = null;
  return rows.map((row) => {
    const key = { correct: row.score.correct, timeMs: row.score.timeMs };
    if (!prev || prev.correct !== key.correct || prev.timeMs !== key.timeMs) {
      rank += 1;
      prev = key;
    }
    return { rank, student: row.student, score: row.score };
  });
}

/** Students who move on from a round: best-ranked first, capped at `advanceCount`, and they must have passed. */
export function pickQualifiers(rows: LeaderboardRow[], config: RoundConfig): Student[] {
  if (config.advanceCount === null) return [];
  return rows
    .filter((r) => r.score.correct >= MIN_CORRECT_TO_ADVANCE)
    .slice(0, config.advanceCount)
    .map((r) => r.student);
}

/** Wheel segment colors are theme tokens (--wheel-1…--wheel-12), cycled per segment. */
export const WHEEL_COLOR_COUNT = 12;
export const wheelColor = (index: number): string =>
  `var(--wheel-${(index % WHEEL_COLOR_COUNT) + 1})`;

export const LETTER_LABELS = ["A", "B", "C", "D"] as const;

export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(s);
}
