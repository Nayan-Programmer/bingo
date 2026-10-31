import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  ROUNDS,
  buildLeaderboard,
  celebrationKind,
  emptyScore,
  pickQualifiers,
  dealFromDeck,
  questionsForRound,
  roundsShortOfQuestions,
  scoreTurn,
  shuffle,
  type CelebrationKind,
  type GameSettings,
  type Question,
  type RoundConfig,
  type Student,
  type StudentScore,
} from "@/lib/game";

export type GamePhase =
  "idle" | "loading" | "spinning" | "answering" | "turn-done" | "round-summary" | "finished";

/** Per-question reveal shape still used by QuestionCard; rounds hide answers until the turn ends. */
export interface RevealedResult {
  status: "correct" | "incorrect" | "timeout";
  correctIndex: number;
  pointsAwarded: number;
}

export interface Turn {
  student: Student;
  questions: Question[];
}

export interface QuizTotal {
  points: number;
  correct: number;
  timeMs: number;
}

interface StartOutcome {
  ok: boolean;
  reason: "no-students" | "not-enough-questions" | "error" | null;
  /** For "not-enough-questions": which rounds are short, e.g. [{round: 2, have: 3, need: 5}]. */
  short?: { round: 1 | 2; have: number; need: number }[];
  /** For "error": what the server said (e.g. no database connected). */
  message?: string | undefined;
}

/** Gap between each ✓/✗ (with its tick or buzzer) when a turn's answers are revealed. */
export const REVEAL_STEP_MS = 450;

export type AnswerMark = "correct" | "wrong" | "skipped";

/**
 * Self-running two-round game. Each student is spun up, gets N questions on ONE shared
 * clock, and is ranked by accuracy then least time. Round 1's top finishers play Round 2.
 */
export function useGameSession() {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [roundIndex, setRoundIndex] = useState(0);
  const [participants, setParticipants] = useState<Student[]>([]);
  const [remaining, setRemaining] = useState<Student[]>([]);
  const [scores, setScores] = useState<Record<string, StudentScore>>({});
  const [qualifiers, setQualifiers] = useState<Student[]>([]);
  const settings: GameSettings = DEFAULT_SETTINGS;
  const [celebrating, setCelebrating] = useState<CelebrationKind | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [spinTargetIndex, setSpinTargetIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [lastScore, setLastScore] = useState<StudentScore | null>(null);
  /** Per-question result of the turn that just ended, revealed one by one. */
  const [lastMarks, setLastMarks] = useState<AnswerMark[]>([]);
  /** Everyone who started the game (Round 1 players) — they all play the circle game. */
  const [roster, setRoster] = useState<Student[]>([]);
  /** Quiz points + time added up over every round a student played. */
  const [quizTotals, setQuizTotals] = useState<Record<string, QuizTotal>>({});

  const round: RoundConfig = ROUNDS[roundIndex] as RoundConfig;

  const pool = useRef<Question[]>([]);
  /** This round's undealt questions — each student gets different ones until it runs out. */
  const deck = useRef<Question[]>([]);
  const answers = useRef<(number | null)[]>([]);
  const startedAt = useRef(0);
  const finishedRef = useRef(true);
  const pendingAdvance = useRef<(() => void) | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const clearAdvance = () => {
    pendingAdvance.current = null;
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };
  useEffect(() => clearAdvance, []);

  const beginSpin = useCallback((list: Student[]) => {
    setSpinTargetIndex(Math.floor(Math.random() * list.length));
    setPhase("spinning");
  }, []);

  const beginRound = useCallback(
    (index: number, players: Student[]) => {
      clearAdvance();
      const order = shuffle(players);
      const cfg = ROUNDS[index] as RoundConfig;
      deck.current = shuffle(questionsForRound(pool.current, cfg.round));
      setRoundIndex(index);
      setParticipants(players);
      setRemaining(order);
      setScores(Object.fromEntries(players.map((s) => [s.id, emptyScore()])));
      setQualifiers([]);
      setCelebrating(null);
      setTurn(null);
      setLastScore(null);
      setSelectedOption(null);
      setQuestionIndex(0);
      setSecondsLeft(0);
      beginSpin(order);
    },
    [beginSpin],
  );

  const start = useCallback(async (): Promise<StartOutcome> => {
    clearAdvance();
    setPhase("loading");
    try {
      const { students: eligible, questions } = await api.loadGame();
      if (eligible.length === 0) {
        setPhase("idle");
        return { ok: false, reason: "no-students" };
      }
      const short = roundsShortOfQuestions(questions);
      if (short.length > 0) {
        setPhase("idle");
        return { ok: false, reason: "not-enough-questions", short };
      }

      pool.current = questions;
      setRoster(eligible);
      setQuizTotals({});
      beginRound(0, eligible);
      return { ok: true, reason: null };
    } catch (error) {
      console.error(error);
      setPhase("idle");
      return {
        ok: false,
        reason: "error",
        message: error instanceof Error ? error.message : undefined,
      };
    }
  }, [beginRound]);

  /** Wheel stopped: deal this student's whole question set and start their single clock. */
  const onSpinEnd = useCallback(() => {
    if (phaseRef.current !== "spinning") return;
    const student = remaining[spinTargetIndex];
    if (!student) return;
    // Each round asks only its own questions, and every student gets different ones.
    const dealt = dealFromDeck(
      deck.current,
      questionsForRound(pool.current, round.round),
      round.questionsPerStudent,
    );
    deck.current = dealt.deck;
    const questions = dealt.hand;
    answers.current = questions.map(() => null);
    startedAt.current = Date.now();
    finishedRef.current = false;
    setTurn({ student, questions });
    setQuestionIndex(0);
    setSelectedOption(null);
    setSecondsLeft(round.secondsPerStudent);
    setPhase("answering");
  }, [remaining, spinTargetIndex, round]);

  const endRound = useCallback(
    (finalScores: Record<string, StudentScore>) => {
      setQuizTotals((prev) => {
        const next = { ...prev };
        for (const s of participants) {
          const sc = finalScores[s.id];
          if (!sc) continue;
          const t = next[s.id] ?? { points: 0, correct: 0, timeMs: 0 };
          next[s.id] = {
            points: t.points + sc.points,
            correct: t.correct + sc.correct,
            timeMs: t.timeMs + sc.timeMs,
          };
        }
        return next;
      });
      const rows = buildLeaderboard(participants, finalScores);
      setQualifiers(pickQualifiers(rows, round));
      setPhase("round-summary");
    },
    [participants, round],
  );

  /** Grade the turn exactly once — either all questions answered or the clock hit zero. */
  const finishTurn = useCallback(
    (timedOut: boolean) => {
      if (finishedRef.current || !turn) return;
      finishedRef.current = true;
      const limitMs = round.secondsPerStudent * 1000;
      const elapsed = timedOut ? limitMs : Math.min(Date.now() - startedAt.current, limitMs);
      const score = scoreTurn(
        turn.questions,
        answers.current,
        elapsed,
        settings.points_per_correct,
      );
      const nextScores = { ...scores, [turn.student.id]: score };
      setScores(nextScores);
      setLastScore(score);
      setLastMarks(
        turn.questions.map((q, i) => {
          const a = answers.current[i] ?? null;
          return a === null ? "skipped" : a === q.correct_index ? "correct" : "wrong";
        }),
      );
      setSecondsLeft(0);
      setPhase("turn-done");

      const nextRemaining = remaining.filter((s) => s.id !== turn.student.id);
      const advance = () => {
        setCelebrating(null);
        setTurn(null);
        setLastScore(null);
        setRemaining(nextRemaining);
        if (nextRemaining.length === 0) endRound(nextScores);
        else beginSpin(nextRemaining);
      };

      const kind = celebrationKind(score);
      // Let the ✓/✗ reveal (one tick or buzzer per question) finish first.
      const revealMs = turn.questions.length * REVEAL_STEP_MS + 700;
      if (kind) {
        // Answered every question: hold here while the video plays; the overlay calls finishCelebration().
        pendingAdvance.current = advance;
        advanceTimer.current = window.setTimeout(() => setCelebrating(kind), revealMs);
      } else {
        advanceTimer.current = window.setTimeout(advance, revealMs + 2000);
      }
    },
    [turn, round, settings.points_per_correct, scores, remaining, endRound, beginSpin],
  );

  const finishRef = useRef(finishTurn);
  finishRef.current = finishTurn;

  // One countdown for the whole question set, driven by the wall clock so it can't drift.
  useEffect(() => {
    if (phase !== "answering") return;
    const deadline = startedAt.current + round.secondsPerStudent * 1000;
    const timer = window.setInterval(() => {
      const msLeft = deadline - Date.now();
      if (msLeft <= 0) {
        window.clearInterval(timer);
        finishRef.current(true);
      } else {
        setSecondsLeft(Math.ceil(msLeft / 1000));
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase, round.secondsPerStudent, turn?.student.id]);

  const selectOption = useCallback((index: number) => {
    if (phaseRef.current !== "answering" || finishedRef.current) return;
    setSelectedOption(index);
  }, []);

  /**
   * Lock in the current answer and move to the next question. Answers stay hidden
   * until the turn ends (so Previous can't be used to fix a buzzed answer).
   * Submitting the last question ends the turn only once every question has an answer.
   */
  const submitAnswer = useCallback(() => {
    if (phaseRef.current !== "answering" || finishedRef.current || selectedOption === null || !turn)
      return;
    answers.current[questionIndex] = selectedOption;
    if (questionIndex + 1 >= turn.questions.length) {
      const firstGap = answers.current.findIndex((a) => a === null);
      if (firstGap === -1) {
        finishTurn(false);
        return;
      }
      // Went back and left one blank: jump to it instead of ending.
      setQuestionIndex(firstGap);
      setSelectedOption(null);
      return;
    }
    setQuestionIndex(questionIndex + 1);
    setSelectedOption(answers.current[questionIndex + 1] ?? null);
  }, [selectedOption, turn, questionIndex, finishTurn]);

  /** Back to the previous question; its earlier choice is still selected and can be changed. */
  const goPrevious = useCallback(() => {
    if (phaseRef.current !== "answering" || finishedRef.current || questionIndex === 0) return;
    answers.current[questionIndex] = selectedOption;
    setQuestionIndex(questionIndex - 1);
    setSelectedOption(answers.current[questionIndex - 1] ?? null);
  }, [questionIndex, selectedOption]);

  /** From the Round 1 summary: take the qualifiers into Round 2. */
  const startNextRound = useCallback(() => {
    const next = roundIndex + 1;
    if (next >= ROUNDS.length || qualifiers.length === 0) {
      setPhase("finished");
      return;
    }
    beginRound(next, qualifiers);
  }, [roundIndex, qualifiers, beginRound]);

  /** Video ended or was skipped: move on to the next student exactly once. */
  const finishCelebration = useCallback(() => {
    const advance = pendingAdvance.current;
    pendingAdvance.current = null;
    advance?.();
  }, []);

  const finishGame = useCallback(() => setPhase("finished"), []);

  return {
    phase,
    round,
    participants,
    remaining,
    scores,
    qualifiers,
    turn,
    questionIndex,
    selectedOption,
    spinTargetIndex,
    secondsLeft,
    lastScore,
    celebrating,
    roster,
    quizTotals,
    isLastRound: roundIndex >= ROUNDS.length - 1,
    start,
    onSpinEnd,
    selectOption,
    submitAnswer,
    goPrevious,
    lastMarks,
    startNextRound,
    finishCelebration,
    finishGame,
  };
}
