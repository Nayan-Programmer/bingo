import { Timer } from "lucide-react";
import { Wheel } from "@/components/game/Wheel";
import { CircleCanvas } from "@/components/game/CircleCanvas";
import { circleBonus } from "@/lib/circle";
import type { useCircleGame } from "@/hooks/use-circle-game";
import { cn } from "@/lib/utils";

type CircleGame = ReturnType<typeof useCircleGame>;

function verdict(score: number | null): string {
  if (score === null) return "No circle this time";
  if (score >= 95) return "Practically perfect! 🤯";
  if (score >= 90) return "Amazing circle! 🌟";
  if (score >= 80) return "Great circle! 👏";
  if (score >= 70) return "Nice one!";
  return "Keep practising!";
}

/** Spinning → drawing → result, one student at a time. */
export function CircleRound({ circle }: { circle: CircleGame }) {
  const done = circle.players.length - circle.remaining.length;

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-5">
      <p className="rounded-full border-2 border-border bg-card px-4 py-1 text-sm font-bold uppercase tracking-widest text-muted-foreground">
        Next game · Draw a Perfect Circle
      </p>

      {circle.phase === "spinning" ? (
        <>
          <p className="animate-pulse font-display text-2xl font-semibold text-muted-foreground">
            Spinning the wheel…
          </p>
          <Wheel
            labels={circle.remaining.map((s) => s.name)}
            targetIndex={circle.spinTargetIndex}
            spinning
            onSpinEnd={circle.onSpinEnd}
          />
        </>
      ) : (
        circle.current && (
          <>
            <div className="animate-pop text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                {circle.phase === "result" ? "Result" : "Now drawing"}
              </p>
              <p className="font-display text-4xl font-semibold text-primary sm:text-5xl">
                {circle.current.name}
              </p>
            </div>

            <div className="relative w-full max-w-[420px]">
              <CircleCanvas
                locked={circle.phase !== "drawing"}
                fit={circle.fit}
                resetKey={circle.canvasKey}
                onStroke={circle.submitStroke}
              />
              {circle.phase === "result" && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p
                    className={cn(
                      "animate-pop font-display text-6xl font-bold tabular-nums drop-shadow-sm sm:text-7xl",
                      circle.lastScore === null
                        ? "text-muted-foreground"
                        : circle.lastScore >= 70
                          ? "text-success"
                          : "text-destructive",
                    )}
                  >
                    {circle.lastScore === null ? "0%" : `${circle.lastScore.toFixed(1)}%`}
                  </p>
                  <p className="mt-1 rounded-full bg-card/90 px-3 py-1 font-semibold">
                    {verdict(circle.lastScore)} · +{circleBonus(circle.lastScore)} pts
                  </p>
                </div>
              )}
            </div>

            {circle.phase === "drawing" && (
              <div className="flex flex-col items-center gap-2 text-center">
                <p
                  className={cn(
                    "font-semibold",
                    circle.hint ? "text-destructive" : "text-muted-foreground",
                  )}
                  role="status"
                >
                  {circle.hint ??
                    "Draw one circle in a single stroke — don't lift your finger or mouse."}
                </p>
                <p
                  className={cn(
                    "flex items-center gap-1.5 font-display text-2xl font-semibold tabular-nums",
                    circle.secondsLeft <= 5 && "text-destructive",
                  )}
                >
                  <Timer className="h-5 w-5" />
                  {circle.secondsLeft}s
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {Math.min(done + 1, circle.players.length)} of {circle.players.length} students
            </p>
          </>
        )
      )}
    </div>
  );
}
