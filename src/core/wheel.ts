/**
 * Pure geometry and arithmetic for the percent wheel. A "turn" is a fraction
 * of a full revolution in [0, 1], measured clockwise from twelve o'clock.
 */

export const MIN_DENOMINATOR = 1;
export const MAX_DENOMINATOR = 100;

export interface Fraction {
  numerator: number;
  denominator: number;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Clamp both parts to whole numbers with 0 ≤ numerator ≤ denominator. */
export function normalize(f: Fraction): Fraction {
  const denominator = clampInt(f.denominator, MIN_DENOMINATOR, MAX_DENOMINATOR);
  const numerator = clampInt(f.numerator, 0, denominator);
  return { numerator, denominator };
}

export function percentOf(f: Fraction): number {
  return (f.numerator / f.denominator) * 100;
}

/**
 * Percent as learners would write it: whole or one-decimal values are exact
 * ("32%", "12.5%"); anything else is rounded to one place and marked "≈".
 */
export function formatPercent(f: Fraction): { text: string; exact: boolean } {
  const { numerator: n, denominator: d } = f;
  if ((n * 100) % d === 0) return { text: `${(n * 100) / d}%`, exact: true };
  if ((n * 1000) % d === 0) return { text: `${(n * 1000) / d / 10}%`, exact: true };
  const rounded = Math.round((n * 1000) / d) / 10;
  return { text: `${rounded}%`, exact: false };
}

/** Spoken form for screen readers, e.g. "3 out of 4, 75 percent". */
export function describe(f: Fraction): string {
  const { text, exact } = formatPercent(f);
  const pct = text.replace("%", " percent");
  return `${f.numerator} out of ${f.denominator}, ${exact ? "" : "about "}${pct}`;
}

/**
 * Turn for a point relative to the wheel's centre (screen coordinates, so y
 * grows downward). Twelve o'clock is 0, three o'clock 0.25, and so on.
 */
export function turnFromPoint(x: number, y: number): number {
  const t = Math.atan2(x, -y) / (2 * Math.PI);
  return t < 0 ? t + 1 : t;
}

export function pointAtTurn(turn: number, r: number): { x: number; y: number } {
  const a = turn * 2 * Math.PI;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

/** Nearest whole number of slices for a turn. */
export function numeratorForTurn(turn: number, denominator: number): number {
  return clampInt(turn * denominator, 0, denominator);
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * SVG path for the shaded sector, growing clockwise from twelve o'clock
 * around a wheel centred on the origin.
 */
export function sectorPath(turn: number, r: number): string {
  if (turn <= 0) return "";
  if (turn >= 1) {
    // A full disc: two half arcs, with no seam line back to the centre.
    return `M0 ${fmt(-r)}A${r} ${r} 0 1 1 0 ${fmt(r)}A${r} ${r} 0 1 1 0 ${fmt(-r)}Z`;
  }
  const end = pointAtTurn(turn, r);
  const large = turn > 0.5 ? 1 : 0;
  return `M0 0L0 ${fmt(-r)}A${r} ${r} 0 ${large} 1 ${fmt(end.x)} ${fmt(end.y)}Z`;
}

/**
 * Follows a pointer dragged around the wheel. The shaded turn tracks the
 * pointer's angle, except that it never wraps across twelve o'clock: winding
 * past the top clockwise holds the wheel full, and winding past it
 * anticlockwise holds it empty, until the pointer comes back round.
 */
export class DragTracker {
  private turn = 0;
  private pinned: "full" | "empty" | null = null;

  start(pointerTurn: number): number {
    this.pinned = null;
    return (this.turn = pointerTurn);
  }

  move(pointerTurn: number): number {
    if (this.pinned === "full") {
      if (pointerTurn < 0.75) return this.turn;
      this.pinned = null;
    } else if (this.pinned === "empty") {
      if (pointerTurn > 0.25) return this.turn;
      this.pinned = null;
    } else {
      // Signed shortest step from the last position. Only a small step can be
      // a crossing of twelve o'clock; a big jump means the pointer swept
      // through the centre, and should simply land where it is.
      const step = ((pointerTurn - this.turn + 1.5) % 1) - 0.5;
      if (Math.abs(step) < 0.25) {
        // Moving clockwise yet landing on a smaller turn means it wrapped.
        if (step > 0 && pointerTurn < this.turn) {
          this.pinned = "full";
          return (this.turn = 1);
        }
        if (step < 0 && pointerTurn > this.turn) {
          this.pinned = "empty";
          return (this.turn = 0);
        }
      }
    }
    return (this.turn = pointerTurn);
  }
}

/**
 * Easing function for a CSS-style cubic-bezier(x1, y1, x2, y2) curve. The
 * returned function maps progress in [0, 1] to eased progress, solving the
 * curve's x for the given time and reading off its y.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  // Polynomial coefficients for one axis, with P0 = 0 and P3 = 1.
  const coeffs = (p1: number, p2: number) => {
    const c = 3 * p1;
    const b = 3 * (p2 - p1) - c;
    return { a: 1 - c - b, b, c };
  };
  const cx = coeffs(x1, x2);
  const cy = coeffs(y1, y2);
  const at = (k: { a: number; b: number; c: number }, s: number) => ((k.a * s + k.b) * s + k.c) * s;
  const slopeX = (s: number) => (3 * cx.a * s + 2 * cx.b) * s + cx.c;

  const solveX = (x: number): number => {
    // Newton's method is fast when the curve is well behaved...
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = at(cx, s) - x;
      if (Math.abs(err) < 1e-6) return s;
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    // ...and bisection catches the cases where it isn't.
    let lo = 0;
    let hi = 1;
    s = x;
    while (hi - lo > 1e-6) {
      if (at(cx, s) < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return at(cy, solveX(t));
  };
}
