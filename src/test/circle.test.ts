import { describe, expect, it } from "vitest";
import { buildFinalBoard, circleBonus, scoreCircle, type Point } from "@/lib/circle";

function ring(n: number, r: number, wobble = 0, turns = 1, cx = 200, cy = 200): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2 * turns;
    const rr = r * (1 + wobble * Math.sin(a * 5));
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
  });
}

describe("draw a perfect circle", () => {
  it("scores a true circle at (almost) 100", () => {
    const res = scoreCircle(ring(200, 120));
    expect(res.ok && res.score).toBeGreaterThan(99);
  });

  it("scores a wobbly circle lower than a clean one", () => {
    const clean = scoreCircle(ring(200, 120, 0.02));
    const wobbly = scoreCircle(ring(200, 120, 0.12));
    expect(clean.ok && wobbly.ok).toBe(true);
    if (clean.ok && wobbly.ok) expect(clean.score).toBeGreaterThan(wobbly.score);
  });

  it("is not fooled by drawing speed (uneven point spacing)", () => {
    const even = ring(200, 120);
    const uneven = [...even.slice(0, 20).flatMap((p) => [p, p, p]), ...even.slice(20)];
    const a = scoreCircle(even);
    const b = scoreCircle(uneven);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(Math.abs(a.score - b.score)).toBeLessThan(1);
  });

  it("rejects strokes that are too short, too small, or not closed", () => {
    expect(scoreCircle(ring(5, 120))).toEqual({ ok: false, reason: "too-short" });
    expect(scoreCircle(ring(200, 20))).toEqual({ ok: false, reason: "too-small" });
    expect(scoreCircle(ring(200, 120, 0, 0.5))).toEqual({ ok: false, reason: "not-closed" });
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i * 8, y: 100 }));
    expect(scoreCircle(line).ok).toBe(false);
  });

  it("turns the circle % into 0–20 quiz bonus points", () => {
    expect(circleBonus(100)).toBe(20);
    expect(circleBonus(87.4)).toBe(17);
    expect(circleBonus(0)).toBe(0);
    expect(circleBonus(null)).toBe(0);
  });
});

describe("combined final board", () => {
  const students = [
    { id: "a", name: "Asha" },
    { id: "b", name: "Bilal" },
    { id: "c", name: "Chen" },
  ];
  it("adds the circle bonus to quiz points and re-ranks", () => {
    const rows = buildFinalBoard(
      students,
      {
        a: { points: 50, timeMs: 40_000 },
        b: { points: 60, timeMs: 30_000 },
        c: { points: 40, timeMs: 20_000 },
      },
      { a: 95, b: 30, c: null },
    );
    // Asha 50+19=69, Bilal 60+6=66, Chen 40+0=40
    expect(rows.map((r) => [r.name, r.total, r.rank])).toEqual([
      ["Asha", 69, 1],
      ["Bilal", 66, 2],
      ["Chen", 40, 3],
    ]);
  });
  it("breaks equal totals by the better circle", () => {
    const rows = buildFinalBoard(
      students.slice(0, 2),
      { a: { points: 50, timeMs: 1 }, b: { points: 52, timeMs: 1 } },
      { a: 70, b: 62 }, // 50+14=64 vs 52+12=64
    );
    expect(rows.map((r) => r.name)).toEqual(["Asha", "Bilal"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});
