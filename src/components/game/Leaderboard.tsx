import { Trophy } from "lucide-react";
import {
  accuracy,
  buildLeaderboard,
  formatSeconds,
  type RoundConfig,
  type Student,
  type StudentScore,
} from "@/lib/game";
import { cn } from "@/lib/utils";

interface LeaderboardProps {
  students: Student[];
  scores: Record<string, StudentScore>;
  round: RoundConfig;
  /** Students moving on to the next round (highlighted). Empty on the final board. */
  qualifierIds?: ReadonlySet<string>;
  title: string;
  subtitle?: string;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({
  students,
  scores,
  round,
  qualifierIds,
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: LeaderboardProps) {
  const rows = buildLeaderboard(students, scores);

  return (
    <div className="game-card w-full max-w-2xl animate-rise p-6 sm:p-8">
      <div className="flex items-center justify-center gap-3">
        <Trophy className="h-8 w-8 text-primary" />
        <h2 className="font-display text-3xl font-semibold">{title}</h2>
      </div>
      {subtitle && <p className="mt-1 text-center text-sm text-muted-foreground">{subtitle}</p>}

      <ol className="mt-6 space-y-2.5">
        {rows.map((row) => {
          const qualified = qualifierIds?.has(row.student.id) ?? false;
          return (
            <li
              key={row.student.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl border-2 px-4 py-3",
                qualified || (!qualifierIds && row.rank === 1) ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              <span className="w-8 text-center font-display text-lg font-semibold">
                {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {row.student.name}
                  {qualified && (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                      Qualified
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.score.correct}/{round.questionsPerStudent} correct · {accuracy(row.score)}% accuracy
                  {row.score.skipped > 0 && ` · ${row.score.skipped} unanswered`}
                </p>
              </div>
              <span className="rounded-xl bg-muted px-3 py-1 font-display text-lg font-semibold tabular-nums">
                {formatSeconds(row.score.timeMs)}
              </span>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={onAction}
        className="mt-6 w-full rounded-2xl bg-primary px-6 py-4 font-display text-lg font-semibold text-primary-foreground transition-all hover:brightness-105 active:scale-[0.99]"
      >
        {actionLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button
          type="button"
          onClick={onSecondary}
          className="mt-3 w-full rounded-2xl border-2 border-border bg-card px-6 py-3 font-semibold transition-colors hover:border-primary hover:text-primary"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}
