import { useEffect, useRef, useState } from "react";
import { wheelColor } from "@/lib/game";

interface WheelProps {
  labels: string[];
  /** Index of the segment the pointer must land on — computed from the same array as `labels`. */
  targetIndex: number;
  spinning: boolean;
  onSpinEnd: () => void;
}

/** How long one spin lasts, and how many full turns it makes. Lower = faster game. */
const SPIN_SECONDS = 1.8;
const SPIN_TURNS = 2;

const VIEW_RADIUS = 110;
const SEGMENT_RADIUS = 97;
const LABEL_RADIUS = 63;
const HUB_RADIUS = 20;

function polar(radius: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [radius * Math.cos(rad), radius * Math.sin(rad)];
}

function segmentPath(startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(SEGMENT_RADIUS, startDeg);
  const [x2, y2] = polar(SEGMENT_RADIUS, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M 0 0 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${SEGMENT_RADIUS} ${SEGMENT_RADIUS} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/**
 * Few names: write them across the slice (they read straight, like a pie chart label).
 * Many names: write them along the slice, hub → rim, where there is far more room —
 * at 26 students a slice is only ~15px wide but ~70px long.
 */
function isRadial(count: number): boolean {
  return count > 8;
}

function labelFontSize(count: number): number {
  if (!isRadial(count)) return count <= 6 ? 11 : 10;
  if (count <= 14) return 9.5;
  if (count <= 20) return 8.5;
  if (count <= 30) return 8;
  if (count <= 40) return 6.8;
  return 5.8;
}

/** How many characters fit along a slice at this font size. */
function truncate(label: string, count: number): string {
  const max = isRadial(count)
    ? Math.max(8, Math.floor((SEGMENT_RADIUS - HUB_RADIUS - 10) / (labelFontSize(count) * 0.56)))
    : 11;
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

/**
 * Spinning selection wheel. Angles are measured clockwise from 12 o'clock (the
 * pointer). `targetIndex` is chosen before the spin by the caller, so the
 * segment under the pointer always matches the selected student.
 */
export function Wheel({ labels, targetIndex, spinning, onSpinEnd }: WheelProps) {
  const [rotation, setRotation] = useState(0);
  const endedRef = useRef(false);
  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;
  const count = labels.length;

  /** Finish the spin exactly once, whether the CSS transition or the safety timer gets there first. */
  const finish = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    onSpinEndRef.current();
  };

  useEffect(() => {
    if (!spinning || count === 0) return;
    endedRef.current = false;
    const seg = 360 / count;
    const center = targetIndex * seg + seg / 2;

    // The wheel is freshly mounted at rotate(0deg). If the new angle is set in the same
    // frame, the browser never paints the start angle, so no transition runs and the wheel
    // would jump (and `transitionend` would never fire). Wait two frames so the start angle is
    // painted first, then change it.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setRotation((current) => {
          const delta = (((360 - center - (current % 360)) % 360) + 360) % 360;
          return current + 360 * SPIN_TURNS + delta;
        });
      });
    });

    // Safety net: if transitionend is skipped (background tab, reduced motion, interrupted
    // transition) the game must still move on.
    const timer = window.setTimeout(finish, SPIN_SECONDS * 1000 + 600);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [spinning, targetIndex, count]);

  if (count === 0) return null;

  const seg = 360 / count;
  const fontSize = labelFontSize(count);
  const radial = isRadial(count);

  return (
    <div className="relative mx-auto w-full max-w-[380px]" aria-label="Student selection wheel">
      {/* Pointer */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1">
        <svg width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
          <polygon
            points="17,25 4,2 30,2"
            fill="var(--accent)"
            stroke="var(--foreground)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <svg
        viewBox={`${-VIEW_RADIUS} ${-VIEW_RADIUS} ${VIEW_RADIUS * 2} ${VIEW_RADIUS * 2}`}
        className="w-full"
      >
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${SPIN_SECONDS}s cubic-bezier(0.12, 0.72, 0.16, 1)`,
          }}
          onTransitionEnd={(e) => {
            if (e.target !== e.currentTarget || e.propertyName !== "transform" || !spinning) return;
            finish();
          }}
        >
          {count === 1 ? (
            <circle r={SEGMENT_RADIUS} fill={wheelColor(0)} stroke="var(--card)" strokeWidth="2" />
          ) : (
            labels.map((label, i) => (
              <path
                key={`${label}-${i}`}
                d={segmentPath(i * seg, (i + 1) * seg)}
                fill={wheelColor(i)}
                stroke="var(--card)"
                strokeWidth="2"
              />
            ))
          )}
          {labels.map((label, i) => {
            const mid = i * seg + seg / 2;
            const text = truncate(label, count);
            const common = {
              fill: "var(--foreground)",
              fontSize,
              fontWeight: 700,
              fontFamily: "var(--font-sans)",
              dominantBaseline: "central" as const,
            };

            if (!radial) {
              const [x, y] = polar(LABEL_RADIUS, mid);
              // Turn names in the bottom half the other way up so none reads upside down.
              const rot = mid > 90 && mid < 270 ? mid + 180 : mid;
              return (
                <text
                  key={`label-${label}-${i}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  transform={`rotate(${rot} ${x.toFixed(2)} ${y.toFixed(2)})`}
                  {...common}
                >
                  {text}
                </text>
              );
            }

            // Written along the slice. Names on the left half are turned the other way up
            // so no name ever appears upside down.
            const r = SEGMENT_RADIUS - 5;
            const flip = mid > 180;
            return (
              <g key={`label-${label}-${i}`} transform={`rotate(${mid})`}>
                <text
                  x={0}
                  y={-r}
                  textAnchor={flip ? "start" : "end"}
                  transform={`rotate(${flip ? 90 : -90} 0 ${-r})`}
                  {...common}
                >
                  {text}
                </text>
              </g>
            );
          })}
        </g>
        {/* Rim and hub stay still */}
        <circle
          r={SEGMENT_RADIUS + 2}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="3"
          opacity="0.9"
        />
        <circle r={HUB_RADIUS} fill="var(--card)" stroke="var(--foreground)" strokeWidth="2.5" />
        <circle r="9" fill="var(--primary)" stroke="var(--foreground)" strokeWidth="2" />
      </svg>
    </div>
  );
}
