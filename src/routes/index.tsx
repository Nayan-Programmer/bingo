import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Play, Users, ListOrdered, Timer, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { Wheel } from "@/components/game/Wheel";
import { QuestionCard } from "@/components/game/QuestionCard";
import { Leaderboard } from "@/components/game/Leaderboard";
import { useGameSession } from "@/hooks/use-game-session";
import { Celebration } from "@/components/game/Celebration";
import { TurnResult } from "@/components/game/TurnResult";
import { CircleRound } from "@/components/game/CircleRound";
import { FinalBoard } from "@/components/game/FinalBoard";
import { useCircleGame } from "@/hooks/use-circle-game";
import { buildFinalBoard } from "@/lib/circle";
import { api } from "@/lib/api";
import { installAudioUnlock, preloadAnswerSfx, primeAudio } from "@/lib/sfx";
import { isMusicMuted, onMusicMutedChange, playMusic, setMusicMuted } from "@/lib/bg-music";
import { ROUNDS, questionsForRound, type Student } from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Spin & Solve — Alphabetical Reasoning Classroom Game" },
      {
        name: "description",
        content:
          "Pick Start Game and the quiz runs itself: the wheel spins, students answer, points and the leaderboard update automatically.",
      },
      { property: "og:title", content: "Spin & Solve — Alphabetical Reasoning Classroom Game" },
      {
        property: "og:description",
        content:
          "Pick Start Game and the quiz runs itself: the wheel spins, students answer, points and the leaderboard update automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GamePage,
});

function GamePage() {
  const game = useGameSession();
  const circle = useCircleGame();
  const [previewStudents, setPreviewStudents] = useState<Student[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questionCounts, setQuestionCounts] = useState<{ r1: number; r2: number } | null>(null);
  const [musicMuted, setMusicMutedState] = useState(false);

  useEffect(() => {
    setMusicMutedState(isMusicMuted());
    return onMusicMutedChange(setMusicMutedState);
  }, []);

  // First click / key anywhere on the page unlocks sound for the rest of the visit.
  useEffect(() => installAudioUnlock(), []);

  // Load the saved roster + question bank for the start screen; the game itself
  // re-fetches everything when Start Game is pressed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.loadGame();
        if (cancelled) return;
        setPreviewStudents(data.students);
        setQuestionCounts({
          r1: questionsForRound(data.questions, 1).length,
          r2: questionsForRound(data.questions, 2).length,
        });
      } catch (error) {
        console.error(error);
        if (!cancelled)
          setLoadError(error instanceof Error ? error.message : "Could not load the class list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = async () => {
    primeAudio(); // lets the celebration sound play later without a browser block
    circle.close();
    playMusic(); // background music loops for the whole game
    preloadAnswerSfx();
    const outcome = await game.start();
    if (!outcome.ok) {
      if (outcome.reason === "no-students") {
        toast.error("No students yet", {
          description: "Ask your teacher to add the class list first.",
        });
      } else if (outcome.reason === "not-enough-questions") {
        toast.error("Not enough questions", {
          description:
            (outcome.short ?? [])
              .map((s) => `Round ${s.round} has ${s.have} of the ${s.need} questions it needs.`)
              .join(" ") + " Ask your teacher to add more on the teacher page.",
        });
      } else {
        toast.error("Could not start the game", {
          description: outcome.message ?? "Please try again.",
          duration: 12000,
        });
      }
    }
  };

  /** Quiz over: straight into the circle game; the leaderboard comes after both games. */
  const startCircleGame = () => {
    game.finishGame();
    circle.start(game.roster);
  };

  const phase = game.phase;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Stage decoration */}
      <div className="stage-blob left-[-120px] top-[-80px] h-80 w-80 bg-primary/40 animate-float-slow" />
      <div className="stage-blob right-[-140px] top-1/3 h-96 w-96 bg-secondary/50" />
      <div className="stage-blob bottom-[-120px] left-1/4 h-80 w-80 bg-accent/25" />

      <header className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-5">
        <p className="font-display text-lg font-semibold tracking-tight">
          Spin <span className="text-primary">&amp;</span> Solve
        </p>
        <button
          type="button"
          onClick={() => setMusicMuted(!musicMuted)}
          aria-label={musicMuted ? "Turn music on" : "Turn music off"}
          title={musicMuted ? "Music off" : "Music on"}
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-colors hover:bg-muted"
        >
          {musicMuted ? (
            <VolumeX className="h-5 w-5" />
          ) : (
            <Volume2 className="h-5 w-5 text-primary" />
          )}
        </button>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
        {phase === "idle" && (
          <div className="flex w-full max-w-3xl flex-col items-center gap-8 text-center">
            <div className="animate-rise">
              <h1 className="text-balance font-display text-4xl font-semibold leading-tight sm:text-5xl">
                Alphabetical Reasoning: <span className="text-primary">Spin &amp; Solve</span>
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-balance text-muted-foreground">
                Round 1: every student gets 5 questions in 90 seconds. Accuracy and least time
                decide — the top 10 move on to Round 2 with 5 new questions in just 60 seconds.
              </p>
            </div>

            <div className="w-full max-w-[380px] opacity-90">
              {previewStudents.length > 0 ? (
                <Wheel
                  labels={previewStudents.map((s) => s.name)}
                  targetIndex={0}
                  spinning={false}
                  onSpinEnd={() => {}}
                />
              ) : (
                <div
                  className="game-card p-6 text-sm text-muted-foreground"
                  role={loadError ? "alert" : undefined}
                >
                  {loadError ? (
                    <span className="font-semibold text-destructive">{loadError}</span>
                  ) : (
                    "No students loaded yet — ask your teacher to add the class list."
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
              <span className="flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3.5 py-1.5">
                <Users className="h-4 w-4 text-primary" />
                {previewStudents.length} students
              </span>
              {questionCounts !== null && (
                <>
                  <span className="flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3.5 py-1.5">
                    <ListOrdered className="h-4 w-4 text-primary" />
                    Round 1: {questionCounts.r1} questions
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3.5 py-1.5">
                    <ListOrdered className="h-4 w-4 text-primary" />
                    Round 2: {questionCounts.r2} questions
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleStart}
              disabled={previewStudents.length === 0}
              className="group flex items-center gap-3 rounded-3xl bg-primary px-10 py-5 font-display text-2xl font-semibold text-primary-foreground shadow-[0_14px_40px_-14px_var(--primary)] transition-all hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-7 w-7 fill-current" />
              Start Game
            </button>
          </div>
        )}

        {phase === "loading" && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-semibold">Loading the saved class list and questions…</p>
          </div>
        )}

        {(phase === "spinning" || phase === "answering" || phase === "turn-done") && (
          <div className="flex w-full max-w-3xl flex-col items-center gap-6">
            <p className="rounded-full border-2 border-border bg-card px-4 py-1 text-sm font-bold uppercase tracking-widest text-muted-foreground">
              {game.round.label} · {game.round.questionsPerStudent} questions ·{" "}
              {game.round.secondsPerStudent} sec
            </p>

            {phase === "answering" && game.turn ? (
              <>
                <div className="animate-pop text-center">
                  <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                    Now answering
                  </p>
                  <p className="font-display text-4xl font-semibold text-primary sm:text-5xl">
                    {game.turn.student.name}
                  </p>
                </div>
                <p className="font-display text-lg font-semibold">
                  Question {game.questionIndex + 1} of {game.turn.questions.length}
                </p>
                <QuestionCard
                  key={game.turn.questions[game.questionIndex]?.id}
                  question={
                    game.turn.questions[game.questionIndex] as NonNullable<
                      typeof game.turn
                    >["questions"][number]
                  }
                  selectedOption={game.selectedOption}
                  reveal={null}
                  secondsLeft={game.secondsLeft}
                  totalSeconds={game.round.secondsPerStudent}
                  onSelect={game.selectOption}
                  onSubmit={game.submitAnswer}
                  onPrevious={game.questionIndex > 0 ? game.goPrevious : undefined}
                />
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Timer className="h-4 w-4" />
                  {game.participants.length - game.remaining.length + 1} of{" "}
                  {game.participants.length} students
                </p>
              </>
            ) : phase === "turn-done" && game.turn && game.lastScore ? (
              <TurnResult
                key={game.turn.student.id}
                name={game.turn.student.name}
                score={game.lastScore}
                marks={game.lastMarks}
                questionCount={game.round.questionsPerStudent}
              />
            ) : (
              <>
                <p className="animate-pulse font-display text-2xl font-semibold text-muted-foreground">
                  Spinning the wheel…
                </p>
                <Wheel
                  labels={game.remaining.map((s) => s.name)}
                  targetIndex={game.spinTargetIndex}
                  spinning
                  onSpinEnd={game.onSpinEnd}
                />
              </>
            )}
          </div>
        )}

        {game.celebrating && game.turn && game.lastScore && (
          <Celebration
            key={`${game.turn.student.id}-${game.celebrating}`}
            kind={game.celebrating}
            studentName={game.turn.student.name}
            score={game.lastScore}
            questionCount={game.round.questionsPerStudent}
            onDone={game.finishCelebration}
          />
        )}

        {phase === "round-summary" && (
          <Leaderboard
            students={game.participants}
            scores={game.scores}
            round={game.round}
            qualifierIds={new Set(game.qualifiers.map((s) => s.id))}
            title={`${game.round.label} results`}
            subtitle={
              game.isLastRound
                ? `${game.participants.length} finalists`
                : game.qualifiers.length > 0
                  ? `Ranked by accuracy, then least time · top ${game.qualifiers.length} go to ${ROUNDS[1]?.label}`
                  : "Nobody answered correctly, so no one moves on."
            }
            actionLabel={
              game.isLastRound || game.qualifiers.length === 0
                ? "Next game: Draw a Perfect Circle ⭕"
                : `Start ${ROUNDS[1]?.label} (${game.qualifiers.length} students · ${ROUNDS[1]?.secondsPerStudent} sec)`
            }
            onAction={
              game.isLastRound || game.qualifiers.length === 0
                ? startCircleGame
                : game.startNextRound
            }
          />
        )}

        {phase === "finished" &&
          (circle.phase === "spinning" ||
            circle.phase === "drawing" ||
            circle.phase === "result") && <CircleRound circle={circle} />}

        {phase === "finished" && circle.phase === "finished" && (
          <FinalBoard
            rows={buildFinalBoard(game.roster, game.quizTotals, circle.scores)}
            actionLabel="Play again"
            onAction={handleStart}
          />
        )}
      </main>
    </div>
  );
}
