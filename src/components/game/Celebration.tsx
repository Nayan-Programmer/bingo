import { useEffect, useRef } from "react";
import { SkipForward } from "lucide-react";
import { playCelebrationSfx } from "@/lib/sfx";
import { pauseMusic, playMusic } from "@/lib/bg-music";
import { formatSeconds, type CelebrationKind, type StudentScore } from "@/lib/game";

const VIDEOS: Record<CelebrationKind, { src: string; headline: (name: string) => string }> = {
  fast: { src: "/aura-of-pi.mp4", headline: (name) => `⚡ ${name} is on fire!` },
  steady: { src: "/steady-finish.mp4", headline: (name) => `✨ ${name} finished every question!` },
};

interface CelebrationProps {
  kind: CelebrationKind;
  studentName: string;
  score: StudentScore;
  questionCount: number;
  onDone: () => void;
}

/** Full-screen clip + sound effect for a student who answered every question (fast or steady). */
export function Celebration({ kind, studentName, score, questionCount, onDone }: CelebrationProps) {
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  // The clip has its own soundtrack: pause the background music while it plays.
  useEffect(() => {
    pauseMusic();
    return () => playMusic();
  }, []);

  useEffect(() => {
    playCelebrationSfx();
    const el = video.current;
    if (!el) return;
    el.play().catch(() => {
      // Browser blocked sound: play silently rather than not at all.
      el.muted = true;
      el.play().catch(() => done.current());
    });
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${studentName} finished every question`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4"
    >
      <div className="text-center text-white">
        <p className="font-display text-3xl font-semibold text-primary sm:text-4xl">{VIDEOS[kind].headline(studentName)}</p>
        <p className="mt-1 text-lg">
          {score.correct}/{questionCount} correct in {formatSeconds(score.timeMs)}
        </p>
      </div>

      <video
        ref={video}
        src={VIDEOS[kind].src}
        playsInline
        onEnded={onDone}
        onError={onDone}
        className="max-h-[68vh] rounded-2xl border-4 border-primary shadow-2xl"
      />

      <button
        type="button"
        onClick={onDone}
        className="flex items-center gap-2 rounded-full bg-white/15 px-5 py-2 font-semibold text-white transition-colors hover:bg-white/25"
      >
        <SkipForward className="h-4 w-4" />
        Skip &amp; continue
      </button>
    </div>
  );
}
