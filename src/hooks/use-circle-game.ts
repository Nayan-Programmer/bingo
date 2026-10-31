import { useCallback, useEffect, useRef, useState } from "react";
import { CIRCLE_ERROR_TEXT, CIRCLE_SECONDS, scoreCircle, type Point } from "@/lib/circle";
import { shuffle, type Student } from "@/lib/game";
import { playCelebrationSfx, playCorrectSfx, playWrongSfx } from "@/lib/sfx";

export type CirclePhase = "off" | "spinning" | "drawing" | "result" | "finished";

const RESULT_MS = 3500;

/**
 * "Draw a Perfect Circle" — the game after the quiz. The wheel picks each student,
 * they get one scored circle (retries allowed only for strokes that don't count),
 * and their % becomes bonus points on the combined final board.
 */
export function useCircleGame() {
  const [phase, setPhase] = useState<CirclePhase>("off");
  const [players, setPlayers] = useState<Student[]>([]);
  const [remaining, setRemaining] = useState<Student[]>([]);
  const [spinTargetIndex, setSpinTargetIndex] = useState(0);
  const [current, setCurrent] = useState<Student | null>(null);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [fit, setFit] = useState<{ center: Point; radius: number } | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(CIRCLE_SECONDS);
  const [attempt, setAttempt] = useState(0);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const deadline = useRef(0);
  const timer = useRef<number | null>(null);
  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  const spin = useCallback((list: Student[]) => {
    setSpinTargetIndex(Math.floor(Math.random() * list.length));
    setFit(null);
    setLastScore(null);
    setHint(null);
    setPhase("spinning");
  }, []);

  const start = useCallback(
    (students: Student[]) => {
      clearTimer();
      const order = shuffle(students);
      setPlayers(students);
      setRemaining(order);
      setScores({});
      setCurrent(null);
      if (order.length === 0) setPhase("finished");
      else spin(order);
    },
    [spin],
  );

  const onSpinEnd = useCallback(() => {
    if (phaseRef.current !== "spinning") return;
    const student = remaining[spinTargetIndex];
    if (!student) return;
    setCurrent(student);
    setAttempt((n) => n + 1);
    deadline.current = Date.now() + CIRCLE_SECONDS * 1000;
    setSecondsLeft(CIRCLE_SECONDS);
    setPhase("drawing");
  }, [remaining, spinTargetIndex]);

  /** Record this student's result, show it, then spin for the next one. */
  const settle = useCallback(
    (score: number | null) => {
      if (!current || phaseRef.current !== "drawing") return;
      const nextScores = { ...scores, [current.id]: score };
      setScores(nextScores);
      setLastScore(score);
      setPhase("result");
      if (score !== null && score >= 90) playCelebrationSfx();
      else if (score !== null && score >= 70) playCorrectSfx();
      else playWrongSfx();

      const nextRemaining = remaining.filter((s) => s.id !== current.id);
      clearTimer();
      timer.current = window.setTimeout(() => {
        setRemaining(nextRemaining);
        setCurrent(null);
        if (nextRemaining.length === 0) setPhase("finished");
        else spin(nextRemaining);
      }, RESULT_MS);
    },
    [current, scores, remaining, spin],
  );

  const settleRef = useRef(settle);
  settleRef.current = settle;

  // One clock per student; a stroke that never counted scores 0.
  useEffect(() => {
    if (phase !== "drawing") return;
    const id = window.setInterval(() => {
      const msLeft = deadline.current - Date.now();
      if (msLeft <= 0) {
        window.clearInterval(id);
        setHint("Time's up!");
        settleRef.current(null);
      } else {
        setSecondsLeft(Math.ceil(msLeft / 1000));
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, current?.id]);

  const submitStroke = useCallback(
    (points: Point[]) => {
      if (phaseRef.current !== "drawing") return;
      const res = scoreCircle(points);
      if (!res.ok) {
        setHint(`${CIRCLE_ERROR_TEXT[res.reason]} Try again!`);
        return;
      }
      setHint(null);
      setFit({ center: res.center, radius: res.radius });
      settle(res.score);
    },
    [settle],
  );

  const close = useCallback(() => {
    clearTimer();
    setPhase("off");
  }, []);

  return {
    phase,
    players,
    remaining,
    spinTargetIndex,
    current,
    scores,
    fit,
    lastScore,
    hint,
    secondsLeft,
    /** Changes for each new student, so the canvas wipes clean. */
    canvasKey: `${current?.id ?? "none"}-${attempt}`,
    start,
    onSpinEnd,
    submitStroke,
    close,
  };
}
