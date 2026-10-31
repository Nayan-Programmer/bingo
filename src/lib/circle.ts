// "Draw a Perfect Circle" — pure scoring, no React or DOM, fully unit-testable.

export interface Point {
  x: number;
  y: number;
}

export type CircleResult =
  | {
      ok: true;
      /** 0–100 with one decimal, e.g. 87.4 */
      score: number;
      center: Point;
      radius: number;
    }
  | { ok: false; reason: "too-short" | "too-small" | "not-closed" };

/** Circle score is added to the quiz as bonus points: score ÷ 5, so 0–20 (worth two correct answers). */
export const CIRCLE_MAX_BONUS = 20;
export const CIRCLE_SECONDS = 20;
/** Smallest radius (in canvas px) that counts as a real attempt. */
export const MIN_RADIUS = 40;

export function circleBonus(score: number | null | undefined): number {
  if (!score || score <= 0) return 0;
  return Math.round((Math.min(score, 100) / 100) * CIRCLE_MAX_BONUS);
}

/** Even spacing along the stroke, so slow and fast parts of the drawing weigh the same. */
export function resample(points: readonly Point[], count = 128): Point[] {
  if (points.length < 2) return [...points];
  const seg: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    seg.push((seg[i - 1] as number) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = seg[seg.length - 1] as number;
  if (total === 0) return [points[0] as Point];
  const out: Point[] = [];
  let j = 1;
  for (let k = 0; k < count; k++) {
    const d = (total * k) / (count - 1);
    while (j < seg.length - 1 && (seg[j] as number) < d) j++;
    const a = points[j - 1] as Point;
    const b = points[j] as Point;
    const span = (seg[j] as number) - (seg[j - 1] as number);
    const t = span === 0 ? 0 : (d - (seg[j - 1] as number)) / span;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/**
 * Score a freehand stroke. The best-fit circle's centre is the average of the
 * evenly spaced points; the score drops with how far each point strays from the
 * average radius, and a little more for a gap between start and end.
 */
export function scoreCircle(raw: readonly Point[]): CircleResult {
  if (raw.length < 10) return { ok: false, reason: "too-short" };
  const pts = resample(raw);
  // The last sample sits on top of the first for a closed loop; leave it out of the fit.
  const fit = pts.slice(0, -1);

  const cx = fit.reduce((s, p) => s + p.x, 0) / fit.length;
  const cy = fit.reduce((s, p) => s + p.y, 0) / fit.length;
  const radii = fit.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const r = radii.reduce((s, v) => s + v, 0) / radii.length;
  if (r < MIN_RADIUS) return { ok: false, reason: "too-small" };

  // How far round the centre the stroke travels (must be nearly a full turn).
  let swept = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    let d = Math.atan2(b.y - cy, b.x - cx) - Math.atan2(a.y - cy, a.x - cx);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    swept += d;
  }
  if (Math.abs(swept) < 2 * Math.PI * 0.85) return { ok: false, reason: "not-closed" };

  const meanDev = radii.reduce((s, v) => s + Math.abs(v - r), 0) / radii.length;
  const first = pts[0] as Point;
  const last = pts[pts.length - 1] as Point;
  const gap = Math.hypot(last.x - first.x, last.y - first.y);

  let score = 100 * (1 - 3 * (meanDev / r));
  score -= 15 * Math.min(gap / r, 1);
  score = Math.max(0, Math.min(100, score));

  return { ok: true, score: Math.round(score * 10) / 10, center: { x: cx, y: cy }, radius: r };
}

export const CIRCLE_ERROR_TEXT: Record<"too-short" | "too-small" | "not-closed", string> = {
  "too-short": "That was too quick — draw one full circle.",
  "too-small": "Too small — draw a bigger circle.",
  "not-closed": "Go all the way round — close the circle.",
};

export interface FinalRow {
  rank: number;
  studentId: string;
  name: string;
  quizPoints: number;
  quizTimeMs: number;
  /** null = didn't manage a valid circle */
  circleScore: number | null;
  bonus: number;
  total: number;
}

/**
 * Combined final board: quiz points (every round) + circle bonus.
 * Ties: better circle, then less quiz time, then name. Exact ties share a rank.
 */
export function buildFinalBoard(
  students: readonly { id: string; name: string }[],
  quiz: Record<string, { points: number; timeMs: number } | undefined>,
  circle: Record<string, number | null | undefined>,
): FinalRow[] {
  const rows = students
    .map((s) => {
      const q = quiz[s.id];
      const circleScore = circle[s.id] ?? null;
      const bonus = circleBonus(circleScore);
      const quizPoints = q?.points ?? 0;
      return {
        rank: 0,
        studentId: s.id,
        name: s.name,
        quizPoints,
        quizTimeMs: q?.timeMs ?? 0,
        circleScore,
        bonus,
        total: quizPoints + bonus,
      };
    })
    .sort(
      (a, b) =>
        b.total - a.total ||
        (b.circleScore ?? -1) - (a.circleScore ?? -1) ||
        a.quizTimeMs - b.quizTimeMs ||
        a.name.localeCompare(b.name),
    );
  let rank = 0;
  let prevKey = "";
  return rows.map((r) => {
    const key = `${r.total}|${r.circleScore}|${r.quizTimeMs}`;
    if (key !== prevKey) {
      rank += 1;
      prevKey = key;
    }
    return { ...r, rank };
  });
}
