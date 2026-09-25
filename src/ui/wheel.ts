import {
  DragTracker,
  cubicBezier,
  describe,
  numeratorForTurn,
  pointAtTurn,
  sectorPath,
  turnFromPoint,
  type Fraction,
} from "../core/wheel";

const SVG_NS = "http://www.w3.org/2000/svg";
const R = 100;
/** Above this many slices, full spokes turn to mush; mark the rim instead. */
const MAX_SPOKES = 50;
/** Sweep curve for the shading: a gentle start and a soft landing. */
const EASE = cubicBezier(0.65, 0, 0.35, 1);
/** Sweep length for a new fraction; scaled by how far the shading travels. */
const SWEEP_MS = 650;
const MIN_SWEEP_MS = 250;
/** Keep the sweep tight while dragging so the shading stays under the finger. */
const DRAG_SWEEP_MS = 60;

interface WheelOptions {
  fraction: Fraction;
  showSlices: boolean;
  reducedMotion: boolean;
  /** The learner dragged, tapped, or used the keyboard to pick a numerator. */
  onChange: (numerator: number) => void;
  /** A drag ended (a good moment to announce the settled value). */
  onRelease: () => void;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * The central pie. Shading grows clockwise from twelve o'clock. The whole disc
 * is a drag surface: the shaded edge follows the pointer, snapping to the
 * nearest slice. It is also a keyboard slider.
 */
export class Wheel {
  readonly el: HTMLElement;
  private root: SVGSVGElement;
  private fill: SVGPathElement;
  private slices: SVGGElement;
  private edge: SVGLineElement;
  private handle: SVGCircleElement;

  private fraction: Fraction;
  private showSlices: boolean;
  private reducedMotion: boolean;
  private onChange: (numerator: number) => void;
  private onRelease: () => void;

  /** The turn currently drawn, which sweeps toward the fraction's value. */
  private shown: number;
  private frame = 0;
  private sweep = { from: 0, to: 0, startedAt: 0, durationMs: 0 };

  private drag = new DragTracker();
  private dragPointer: number | null = null;

  constructor(opts: WheelOptions) {
    this.fraction = opts.fraction;
    this.showSlices = opts.showSlices;
    this.reducedMotion = opts.reducedMotion;
    this.onChange = opts.onChange;
    this.onRelease = opts.onRelease;
    this.shown = this.target();

    const pad = 12; // room for the handle and focus ring past the rim
    this.root = svg("svg", {
      class: "wheel__svg",
      viewBox: `${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}`,
      "aria-hidden": "true",
    });
    this.fill = svg("path", { class: "wheel__fill" });
    this.slices = svg("g", { class: "wheel__slices" });
    this.edge = svg("line", { class: "wheel__edge", x1: 0, y1: 0 });
    this.handle = svg("circle", { class: "wheel__handle", r: 8 });
    this.root.append(
      svg("circle", { class: "wheel__face", r: R }),
      this.fill,
      this.slices,
      svg("circle", { class: "wheel__rim", r: R }),
      svg("line", { class: "wheel__start", x1: 0, y1: 0, x2: 0, y2: -R }),
      this.edge,
      svg("circle", { class: "wheel__hub", r: 3.5 }),
      this.handle,
    );

    this.el = document.createElement("div");
    this.el.className = "wheel";
    this.el.tabIndex = 0;
    this.el.setAttribute("role", "slider");
    this.el.setAttribute("aria-label", "Shaded part of the wheel");
    this.el.append(this.root);

    this.el.addEventListener("pointerdown", this.onPointerDown);
    this.el.addEventListener("pointermove", this.onPointerMove);
    this.el.addEventListener("pointerup", this.onPointerEnd);
    this.el.addEventListener("pointercancel", this.onPointerEnd);
    this.el.addEventListener("lostpointercapture", this.onPointerEnd);
    this.el.addEventListener("keydown", this.onKeyDown);

    this.drawSlices();
    this.updateAria();
    this.draw();
  }

  setFraction(f: Fraction): void {
    const denominatorChanged = f.denominator !== this.fraction.denominator;
    this.fraction = f;
    if (denominatorChanged) this.drawSlices();
    this.updateAria();
    this.animateTo();
  }

  setShowSlices(show: boolean): void {
    this.showSlices = show;
    this.drawSlices();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------ input

  private pointerTurn(e: PointerEvent): { turn: number; nearCentre: boolean } {
    const box = this.root.getBoundingClientRect();
    const x = e.clientX - (box.left + box.width / 2);
    const y = e.clientY - (box.top + box.height / 2);
    // At the very centre the angle is meaningless, so it shouldn't move anything.
    return { turn: turnFromPoint(x, y), nearCentre: Math.hypot(x, y) < box.width * 0.04 };
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.dragPointer != null) return;
    e.preventDefault();
    // Take focus so arrow keys work next, without a focus ring for a pointer.
    this.el.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    this.dragPointer = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add("wheel--dragging");
    const { turn, nearCentre } = this.pointerTurn(e);
    // From the hub, start from whatever is shaded now rather than jumping.
    this.pick(this.drag.start(nearCentre ? this.target() : turn));
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.dragPointer) return;
    const { turn, nearCentre } = this.pointerTurn(e);
    if (nearCentre) return;
    this.pick(this.drag.move(turn));
  };

  private readonly onPointerEnd = (e: PointerEvent) => {
    if (e.pointerId !== this.dragPointer) return;
    this.dragPointer = null;
    this.el.classList.remove("wheel--dragging");
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    this.onRelease();
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const { numerator: n, denominator: d } = this.fraction;
    const big = Math.max(1, Math.round(d / 10));
    const next: Record<string, number> = {
      ArrowRight: n + 1,
      ArrowUp: n + 1,
      ArrowLeft: n - 1,
      ArrowDown: n - 1,
      PageUp: n + big,
      PageDown: n - big,
      Home: 0,
      End: d,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    const value = Math.min(d, Math.max(0, next[e.key]!));
    if (value !== n) this.onChange(value);
  };

  private pick(turn: number): void {
    const n = numeratorForTurn(turn, this.fraction.denominator);
    if (n !== this.fraction.numerator) this.onChange(n);
  }

  // ------------------------------------------------------------ drawing

  private target(): number {
    return this.fraction.numerator / this.fraction.denominator;
  }

  private animateTo(): void {
    const goal = this.target();
    if (this.reducedMotion) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.shown = goal;
      this.draw();
      return;
    }
    // Start from wherever the shading is drawn now, so an interrupted sweep
    // carries on smoothly toward the new value instead of jumping.
    const distance = Math.abs(goal - this.shown);
    const durationMs =
      this.dragPointer != null ? DRAG_SWEEP_MS : MIN_SWEEP_MS + (SWEEP_MS - MIN_SWEEP_MS) * distance;
    this.sweep = { from: this.shown, to: goal, startedAt: performance.now(), durationMs };
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    const { from, to, startedAt, durationMs } = this.sweep;
    const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
    this.shown = from + (to - from) * EASE(progress);
    this.draw();
    this.frame = progress < 1 ? requestAnimationFrame(this.tick) : 0;
  };

  private draw(): void {
    const t = this.shown;
    this.fill.setAttribute("d", sectorPath(t, R));
    const tip = pointAtTurn(t, R);
    this.edge.setAttribute("x2", String(tip.x));
    this.edge.setAttribute("y2", String(tip.y));
    this.edge.style.display = t <= 0 || t >= 1 ? "none" : "";
    this.handle.setAttribute("cx", String(tip.x));
    this.handle.setAttribute("cy", String(tip.y));
  }

  private drawSlices(): void {
    const d = this.fraction.denominator;
    this.slices.replaceChildren();
    if (!this.showSlices || d < 2) return;
    const inner = d > MAX_SPOKES ? R * 0.93 : 0;
    // i = 0 is the start line at twelve o'clock, drawn separately.
    for (let i = 1; i < d; i++) {
      const a = pointAtTurn(i / d, inner);
      const b = pointAtTurn(i / d, R);
      this.slices.append(svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
  }

  private updateAria(): void {
    const { numerator, denominator } = this.fraction;
    this.el.setAttribute("aria-valuemin", "0");
    this.el.setAttribute("aria-valuemax", String(denominator));
    this.el.setAttribute("aria-valuenow", String(numerator));
    this.el.setAttribute("aria-valuetext", describe(this.fraction));
  }
}
