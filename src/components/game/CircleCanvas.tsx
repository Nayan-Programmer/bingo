import { useEffect, useRef } from "react";
import type { Point } from "@/lib/circle";

/** Drawing happens in a fixed 400×400 space, whatever size the canvas shows at. */
export const CANVAS_SIZE = 400;

interface CircleCanvasProps {
  /** Locks the canvas (after a scored attempt or when time is up). */
  locked: boolean;
  /** Best-fit circle to overlay once scored. */
  fit: { center: Point; radius: number } | null;
  /** Bump to wipe the canvas for a retry or the next student. */
  resetKey: string | number;
  onStroke: (points: Point[]) => void;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function CircleCanvas({ locked, fit, resetKey, onStroke }: CircleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = useRef<Point[]>([]);
  const drawing = useRef(false);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const redraw = (overlay: CircleCanvasProps["fit"]) => {
    const c = ctx();
    const el = canvasRef.current;
    if (!c || !el) return;
    const dpr = el.width / CANVAS_SIZE;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (overlay) {
      c.save();
      c.setLineDash([8, 8]);
      c.lineWidth = 3;
      c.strokeStyle = cssVar("--success", "#2a9d6a");
      c.beginPath();
      c.arc(overlay.center.x, overlay.center.y, overlay.radius, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    const pts = points.current;
    if (pts.length > 1) {
      c.lineWidth = 7;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = cssVar("--primary", "#f0b429");
      c.beginPath();
      c.moveTo((pts[0] as Point).x, (pts[0] as Point).y);
      for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
      c.stroke();
    }
  };

  // Sharp lines on high-DPI screens.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    el.width = CANVAS_SIZE * dpr;
    el.height = CANVAS_SIZE * dpr;
    redraw(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    points.current = [];
    drawing.current = false;
    redraw(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    redraw(fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onStroke([...points.current]);
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="Drawing area — draw one circle without lifting your finger or mouse"
      className="aspect-square w-full touch-none select-none rounded-3xl border-4 border-dashed border-border bg-card shadow-inner data-[locked=true]:cursor-not-allowed data-[locked=false]:cursor-crosshair"
      data-locked={locked}
      onPointerDown={(e) => {
        if (locked) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        points.current = [toPoint(e)];
        redraw(null);
      }}
      onPointerMove={(e) => {
        if (!drawing.current || locked) return;
        points.current.push(toPoint(e));
        redraw(null);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
    />
  );
}
