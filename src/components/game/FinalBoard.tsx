import { Trophy } from "lucide-react";
import { CIRCLE_MAX_BONUS, type FinalRow } from "@/lib/circle";
import { cn } from "@/lib/utils";

interface FinalBoardProps {
  rows: FinalRow[];
  actionLabel: string;
  onAction: () => void;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Grand final: quiz points (all rounds) + circle bonus. */
export function FinalBoard({ rows, actionLabel, onAction }: FinalBoardProps) {
  return (
    <div className="game-card w-full max-w-2xl animate-rise p-6 sm:p-8">
      <div className="flex items-center justify-center gap-3">
        <Trophy className="h-8 w-8 text-primary" />
        <h2 className="font-display text-3xl font-semibold">Grand final</h2>
      </div>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Quiz points + circle bonus (circle % ÷ 5, up to {CIRCLE_MAX_BONUS} points)
      </p>

      <ol className="mt-6 space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.studentId}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 px-4 py-3",
              row.rank === 1 ? "border-primary bg-primary/10" : "border-border bg-card",
            )}
          >
            <span className="w-8 text-center font-display text-lg font-semibold">
              {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{row.name}</p>
              <p className="text-xs text-muted-foreground">
                Quiz {row.quizPoints} pts ·{" "}
                {row.circleScore === null
                  ? "no circle"
                  : `circle ${row.circleScore.toFixed(1)}% (+${row.bonus})`}
              </p>
            </div>
            <span className="rounded-xl bg-muted px-3 py-1 font-display text-lg font-semibold tabular-nums">
              {row.total} pts
            </span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onAction}
        className="mt-6 w-full rounded-2xl bg-primary px-6 py-4 font-display text-lg font-semibold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.99]"
      >
        {actionLabel}
      </button>
    </div>
  );
}
