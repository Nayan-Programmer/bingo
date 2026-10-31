// Tiny synthesized sound effects (Web Audio) — no audio files to ship.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** Call from a click handler so browsers allow sound later in the game. */
export function primeAudio(): void {
  void getContext()?.resume();
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, peak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** Rising fanfare + sparkle + clap burst, ~1.6 seconds. */
export function playCelebrationSfx(): void {
  const c = getContext();
  if (!c) return;
  void c.resume();
  const t = c.currentTime + 0.05;

  // Fanfare: C5 E5 G5 C6, then a held chord.
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.12, 0.28, "triangle", 0.28));
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(c, f, t + 0.55, 0.9, "sine", 0.14));

  // Sparkle: quick descending high notes.
  [2093, 1760, 1568, 1318].forEach((f, i) => tone(c, f, t + 0.7 + i * 0.07, 0.15, "sine", 0.07));

  // Applause-ish noise burst.
  const length = Math.floor(c.sampleRate * 0.9);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2200;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  noise.connect(filter).connect(gain).connect(c.destination);
  noise.start(t + 0.5);
}

// Answer feedback sounds: a tick for right (public/correct.mp3), a buzzer for wrong
// (public/wrong.mp3). They play through the same Web Audio context as the fanfare, which
// a single click unlocks for the whole visit — so they also work when they fire a moment
// after the click (end-of-turn reveal), including on Safari / iPad. A plain <audio>
// element is the fallback while the clips are still loading.
type ClipKind = "correct" | "wrong";
const CLIP_SRC: Record<ClipKind, string> = { correct: "/correct.mp3", wrong: "/wrong.mp3" };
const CLIP_VOLUME: Record<ClipKind, number> = { correct: 0.9, wrong: 0.7 };
const buffers: Partial<Record<ClipKind, AudioBuffer>> = {};
const loading: Partial<Record<ClipKind, Promise<void>>> = {};
const fallback: Partial<Record<ClipKind, HTMLAudioElement>> = {};

function loadClip(kind: ClipKind): Promise<void> {
  const c = getContext();
  if (!c) return Promise.resolve();
  loading[kind] ??= fetch(CLIP_SRC[kind])
    .then((r) => {
      if (!r.ok) throw new Error(`${CLIP_SRC[kind]}: HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      buffers[kind] = buf;
    })
    .catch((err) => {
      console.warn("[sound] could not load", CLIP_SRC[kind], err);
      delete loading[kind];
    });
  return loading[kind] as Promise<void>;
}

function playClip(kind: ClipKind): void {
  const c = getContext();
  const buf = buffers[kind];
  if (c && buf) {
    void c.resume();
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = CLIP_VOLUME[kind];
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
    return;
  }
  void loadClip(kind);
  if (typeof window === "undefined") return;
  const el = (fallback[kind] ??= Object.assign(new Audio(CLIP_SRC[kind]), { volume: CLIP_VOLUME[kind] }));
  el.currentTime = 0;
  el.play().catch((err) => console.warn("[sound] blocked:", CLIP_SRC[kind], err?.name ?? err));
}

/** Load both answer sounds ahead of time so the first one isn't delayed. */
export function preloadAnswerSfx(): void {
  void loadClip("correct");
  void loadClip("wrong");
}

/**
 * Browsers only allow sound after the person clicks or presses a key. On the first
 * such interaction anywhere on the page, wake the audio engine and load the clips.
 * Returns a cleanup function.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  const unlock = () => {
    primeAudio();
    preloadAnswerSfx();
    const c = getContext();
    if (c?.state === "running") remove();
  };
  const remove = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return remove;
}

/** Short "tick" for a right answer. */
export function playCorrectSfx(): void {
  playClip("correct");
}

/** Buzzer for a wrong answer. */
export function playWrongSfx(): void {
  playClip("wrong");
}
