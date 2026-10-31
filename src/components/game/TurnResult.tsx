import { useEffect, useState } from "react";
import { Check, Minus, X } from "lucide-react";
import { formatSeconds, type StudentScore } from "@/lib/game";
import { REVEAL_STEP_MS, type AnswerMark } from "@/hooks/use-game-session";
import { playCorrectSfx, playWrongSfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

interface TurnResultProps {
  name: string;
  score: StudentScore;
  marks: AnswerMark[];
  questionCount: number;
}

/** End of a turn: each answer flips to ✓ (tick) or ✗ (buzzer) in order, then the totals. */
export function TurnResult({ name, score, marks, questionCount }: TurnResultProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const timers = marks.map((mark, i) =>
      window.setTimeout(
        () => {
          setShown(i + 1);
          if (mark === "correct") playCorrectSfx();
          else if (mark === "wrong") playWrongSfx();
        },
        300 + i * REVEAL_STEP_MS,
      ),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [marks]);

  const allShown = shown >= marks.length;

  return (
    <div className="game-card w-full max-w-md animate-pop p-8 text-center">
      <p className="font-display text-3xl font-semibold text-primary">{name}</p>

      <div className="mt-5 flex justify-center gap-2.5" aria-label="Answers">
        {marks.map((mark, i) => {
          const visible = i < shown;
          return (
            <span
              key={i}
              aria-label={visible ? `Question ${i + 1}: ${mark}` : `Question ${i + 1}`}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 font-display text-lg font-semibold transition-all",
                !visible && "border-border bg-muted text-muted-foreground",
                visible &&
                  mark === "correct" &&
                  "animate-pop border-success bg-success text-success-foreground",
                visible &&
                  mark === "wrong" &&
                  "animate-pop border-destructive bg-destructive text-destructive-foreground",
                visible &&
                  mark === "skipped" &&
                  "animate-pop border-border bg-card text-muted-foreground",
              )}
            >
              {!visible ? (
                i + 1
              ) : mark === "correct" ? (
                <Check className="h-6 w-6" strokeWidth={3} />
              ) : mark === "wrong" ? (
                <X className="h-6 w-6" strokeWidth={3} />
              ) : (
                <Minus className="h-6 w-6" />
              )}
            </span>
          );
        })}
      </div>

      <div
        className={cn("transition-opacity duration-300", allShown ? "opacity-100" : "opacity-0")}
      >
        <p className="mt-5 font-display text-5xl font-semibold">
          {score.correct}/{questionCount}
        </p>
        <p className="mt-1 text-muted-foreground">correct</p>
        <p className="mt-4 font-display text-2xl font-semibold tabular-nums">
          {formatSeconds(score.timeMs)}
        </p>
        <p className="text-sm text-muted-foreground">
          {score.skipped > 0 ? "time ran out" : "time used"}
        </p>
      </div>
    </div>
  );
}
