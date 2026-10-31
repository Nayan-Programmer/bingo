import { CheckCircle2, ChevronLeft, Lightbulb, Timer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LETTER_LABELS, type Question } from "@/lib/game";
import type { RevealedResult } from "@/hooks/use-game-session";
import { cn } from "@/lib/utils";

interface QuestionCardProps {
  question: Question;
  selectedOption: number | null;
  reveal: RevealedResult | null;
  secondsLeft: number;
  totalSeconds: number;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  /** Shown from the 2nd question on: go back and change an earlier answer. */
  onPrevious?: (() => void) | undefined;
}

export function QuestionCard({
  question,
  selectedOption,
  reveal,
  secondsLeft,
  totalSeconds,
  onSelect,
  onSubmit,
  onPrevious,
}: QuestionCardProps) {
  const revealed = reveal !== null;
  const urgent = secondsLeft <= 5 && !revealed;
  const pct = revealed ? 0 : Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));

  return (
    <div className="game-card w-full max-w-2xl p-6 sm:p-8">
      {/* Countdown */}
      <div className="mb-5 flex items-center gap-3">
        <Timer
          className={cn("h-5 w-5 shrink-0", urgent ? "text-destructive" : "text-muted-foreground")}
        />
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-1000 ease-linear",
              urgent ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className={cn(
            "w-8 text-right font-display text-lg font-semibold tabular-nums",
            urgent && "text-destructive",
          )}
        >
          {secondsLeft}
        </span>
      </div>

      <h2 className="text-balance text-xl font-semibold leading-snug sm:text-2xl">
        {question.prompt}
      </h2>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {question.options.map((option, i) => {
          const isCorrect = revealed && i === question.correct_index;
          const isWrongPick = revealed && i === selectedOption && !isCorrect;
          return (
            <button
              key={i}
              type="button"
              disabled={revealed}
              onClick={() => onSelect(i)}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left font-semibold transition-all",
                "hover:border-primary hover:bg-primary/10",
                !revealed &&
                  selectedOption === i &&
                  "border-primary bg-primary/15 ring-2 ring-ring",
                !revealed && selectedOption !== i && "border-border bg-card",
                isCorrect &&
                  "border-success bg-success text-success-foreground hover:border-success hover:bg-success",
                isWrongPick &&
                  "border-destructive bg-destructive text-destructive-foreground hover:border-destructive hover:bg-destructive",
                revealed && !isCorrect && !isWrongPick && "border-border bg-card opacity-55",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted font-display text-base font-semibold",
                  isCorrect && "bg-success-foreground/20 text-success-foreground",
                  isWrongPick && "bg-destructive-foreground/20 text-destructive-foreground",
                )}
              >
                {LETTER_LABELS[i]}
              </span>
              <span className="min-w-0 flex-1">{option}</span>
              {isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0" />}
              {isWrongPick && <XCircle className="h-5 w-5 shrink-0" />}
            </button>
          );
        })}
      </div>

      {revealed ? (
        <div
          className={cn(
            "mt-5 animate-pop rounded-2xl border-2 p-4",
            reveal.status === "correct" && "border-success bg-success/10",
            reveal.status === "incorrect" && "border-destructive bg-destructive/10",
            reveal.status === "timeout" && "border-primary bg-primary/10",
          )}
        >
          <p className="font-display text-lg font-semibold">
            {reveal.status === "correct" && `Correct! +${reveal.pointsAwarded} points`}
            {reveal.status === "incorrect" &&
              `Not quite — the answer is ${question.options[question.correct_index]}`}
            {reveal.status === "timeout" &&
              `Time's up — the answer is ${question.options[question.correct_index]}`}
          </p>
          {question.explanation && (
            <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              {question.explanation}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5 flex gap-3">
          {onPrevious && (
            <Button
              size="lg"
              variant="outline"
              className="shrink-0 border-2 font-display text-lg"
              onClick={onPrevious}
            >
              <ChevronLeft className="h-5 w-5" />
              Previous
            </Button>
          )}
          <Button
            size="lg"
            className="flex-1 font-display text-lg"
            disabled={selectedOption === null}
            onClick={onSubmit}
          >
            Submit answer
          </Button>
        </div>
      )}
    </div>
  );
}
