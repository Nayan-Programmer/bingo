// Looping background music for the game screen (public/bg-music.mp3).
// Starts on Start Game (a click, so browsers allow it), ducks out while the
// celebration video plays, and remembers the mute choice per browser.

const SRC = "/bg-music.mp3";
const VOLUME = 0.35;
const MUTE_KEY = "spin-solve:music-muted";

let audio: HTMLAudioElement | null = null;
let wanted = false; // game wants music right now (not paused for the video)
let muted = readMuted();
const listeners = new Set<(muted: boolean) => void>();

function readMuted(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function el(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio(SRC);
    audio.loop = true;
    audio.volume = VOLUME;
    audio.preload = "auto";
  }
  return audio;
}

function sync(): void {
  const a = el();
  if (!a) return;
  if (wanted && !muted) {
    a.play().catch((err) => {
      // Blocked (no click yet, or the browser said no): try again on the next click / key.
      console.warn("[sound] background music blocked:", err?.name ?? err);
      retryOnNextInteraction();
    });
  } else {
    a.pause();
  }
}

let retryArmed = false;
function retryOnNextInteraction(): void {
  if (retryArmed || typeof window === "undefined") return;
  retryArmed = true;
  const retry = () => {
    retryArmed = false;
    window.removeEventListener("pointerdown", retry, true);
    window.removeEventListener("keydown", retry, true);
    sync();
  };
  window.addEventListener("pointerdown", retry, true);
  window.addEventListener("keydown", retry, true);
}

/** Start (or resume) the music. Call from a click handler. */
export function playMusic(): void {
  wanted = true;
  sync();
}

/** Pause the music, e.g. while the celebration video has its own soundtrack. */
export function pauseMusic(): void {
  wanted = false;
  sync();
}

export function isMusicMuted(): boolean {
  return muted;
}

export function setMusicMuted(next: boolean): void {
  muted = next;
  // Turning the speaker on is a clear "I want music": start it right away, even before Start Game.
  if (!next) wanted = true;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable — keep the choice for this visit only */
  }
  sync();
  listeners.forEach((fn) => fn(muted));
}

export function onMusicMutedChange(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
