import { describe, expect, it } from "vitest";
import {
  ROUNDS,
  accuracy,
  buildLeaderboard,
  earnedCelebration,
  celebrationKind,
  pickQualifiers,
  scoreTurn,
  questionsForRound,
  dealFromDeck,
  studentsWithoutRepeats,
  shuffle,
  roundsShortOfQuestions,
  type Question,
  type Student,
  type StudentScore,
} from "@/lib/game";

const student = (id: string): Student => ({
  id,
  name: id,
  is_sample: false,
  eligible: true,
  created_at: "",
});
const q = (id: string, correct = 0): Question => ({
  id,
  prompt: id,
  options: ["a", "b", "c", "d"],
  correct_index: correct,
  explanation: "",
  is_sample: false,
  round: 1,
  created_at: "",
});
const score = (correct: number, timeMs: number): StudentScore => ({
  correct,
  incorrect: 5 - correct,
  skipped: 0,
  points: correct * 10,
  timeMs,
});

describe("rounds", () => {
  it("matches the spec: 5 questions, 90s then 60s, top 10 advance", () => {
    expect(ROUNDS[0]).toMatchObject({
      questionsPerStudent: 5,
      secondsPerStudent: 90,
      advanceCount: 10,
    });
    expect(ROUNDS[1]).toMatchObject({
      questionsPerStudent: 5,
      secondsPerStudent: 60,
      advanceCount: null,
    });
  });
});

describe("scoreTurn", () => {
  it("counts unanswered as skipped and keeps elapsed time", () => {
    const qs = [q("1"), q("2"), q("3")];
    const s = scoreTurn(qs, [0, 2, null], 41234, 10);
    expect(s).toMatchObject({ correct: 1, incorrect: 1, skipped: 1, points: 10, timeMs: 41234 });
    expect(accuracy(s)).toBe(33);
  });
});

describe("leaderboard", () => {
  it("ranks by correct answers, then least time", () => {
    const rows = buildLeaderboard([student("slow"), student("fast"), student("best")], {
      slow: score(4, 80000),
      fast: score(4, 40000),
      best: score(5, 85000),
    });
    expect(rows.map((r) => r.student.id)).toEqual(["best", "fast", "slow"]);
  });

  it("sends only the top 10 who got at least one right to the next round", () => {
    const students = Array.from({ length: 12 }, (_, i) => student(`s${i}`));
    const scores: Record<string, StudentScore> = {};
    students.forEach((s, i) => (scores[s.id] = score(i === 11 ? 0 : 5 - (i % 5), 1000 * (i + 1))));
    const rows = buildLeaderboard(students, scores);
    const qualified = pickQualifiers(rows, ROUNDS[0]!);
    expect(qualified).toHaveLength(10);
    expect(qualified.map((s) => s.id)).not.toContain("s11");
  });

  it("returns nobody after the final round", () => {
    expect(
      pickQualifiers(buildLeaderboard([student("a")], { a: score(5, 1) }), ROUNDS[1]!),
    ).toEqual([]);
  });
});

describe("celebration", () => {
  const base = { incorrect: 0, points: 0 };
  it("plays when every question is answered in under 50 seconds", () => {
    expect(
      earnedCelebration({ ...base, correct: 3, incorrect: 2, skipped: 0, timeMs: 49_900 }),
    ).toBe(true);
  });
  it("does not play at 50s or more, or when a question was left unanswered", () => {
    expect(earnedCelebration({ ...base, correct: 5, skipped: 0, timeMs: 50_000 })).toBe(false);
    expect(earnedCelebration({ ...base, correct: 4, skipped: 1, timeMs: 30_000 })).toBe(false);
  });
  it("picks fast (aura-of-pi) under 50s, steady (steady-finish) at 50s+, nothing when time ran out", () => {
    expect(celebrationKind({ ...base, correct: 5, skipped: 0, timeMs: 49_999 })).toBe("fast");
    expect(celebrationKind({ ...base, correct: 5, skipped: 0, timeMs: 50_000 })).toBe("steady");
    expect(celebrationKind({ ...base, correct: 1, incorrect: 4, skipped: 0, timeMs: 85_000 })).toBe(
      "steady",
    );
    expect(celebrationKind({ ...base, correct: 3, skipped: 2, timeMs: 90_000 })).toBe(null);
  });
});

describe("separate questions per round", () => {
  const mk = (id: string, round: 1 | 2): Question => ({ ...q(id), round });
  const pool = [mk("a", 1), mk("b", 1), mk("c", 2)];
  it("gives each round only its own questions", () => {
    expect(questionsForRound(pool, 1).map((x) => x.id)).toEqual(["a", "b"]);
    expect(questionsForRound(pool, 2).map((x) => x.id)).toEqual(["c"]);
  });
  it("reports which rounds are short of questions", () => {
    expect(roundsShortOfQuestions(pool)).toEqual([
      { round: 1, have: 2, need: 5 },
      { round: 2, have: 1, need: 5 },
    ]);
    const full = [
      ...["1", "2", "3", "4", "5"].map((i) => mk(`r1-${i}`, 1)),
      ...["1", "2", "3", "4", "5"].map((i) => mk(`r2-${i}`, 2)),
    ];
    expect(roundsShortOfQuestions(full)).toEqual([]);
  });
});

describe("different questions for every student", () => {
  const pool = Array.from({ length: 12 }, (_, i) => q(`q${i}`));
  it("never gives two students the same question while the deck lasts", () => {
    let deck = shuffle(pool);
    const seen = new Set<string>();
    for (let s = 0; s < 2; s++) {
      const dealt = dealFromDeck(deck, pool, 5);
      deck = dealt.deck;
      expect(dealt.hand).toHaveLength(5);
      for (const x of dealt.hand) {
        expect(seen.has(x.id)).toBe(false);
        seen.add(x.id);
      }
    }
  });
  it("reshuffles when the deck runs out, with no repeats inside one student's set", () => {
    let deck = shuffle(pool);
    for (let s = 0; s < 10; s++) {
      const dealt = dealFromDeck(deck, pool, 5);
      deck = dealt.deck;
      expect(new Set(dealt.hand.map((x) => x.id)).size).toBe(5);
    }
  });
  it("tells the teacher how many students fit before repeats", () => {
    expect(studentsWithoutRepeats(12, 5)).toBe(2);
    expect(studentsWithoutRepeats(50, 5)).toBe(10);
  });
});
