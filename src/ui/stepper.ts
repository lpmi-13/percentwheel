import { h } from "./dom";

interface StepperOptions {
  /** Accessible name, e.g. "Numerator". */
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

const REPEAT_DELAY = 420;
const REPEAT_START = 110;
const REPEAT_FASTEST = 35;

/**
 * A large editable number flanked by − and + buttons. The number can be typed
 * directly; holding a button repeats, speeding up the longer it is held.
 */
export class Stepper {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private dec: HTMLButtonElement;
  private inc: HTMLButtonElement;
  private value: number;
  private min: number;
  private max: number;
  private onChange: (value: number) => void;
  private repeatTimer: number | undefined;

  constructor(opts: StepperOptions) {
    this.value = opts.value;
    this.min = opts.min;
    this.max = opts.max;
    this.onChange = opts.onChange;

    this.input = h("input", {
      class: "stepper__value",
      type: "text",
      attrs: {
        inputmode: "numeric",
        autocomplete: "off",
        enterkeyhint: "done",
        "aria-label": opts.label,
      },
      on: {
        input: () => {
          // Digits only, and no more of them than the largest value allows.
          const digits = this.input.value.replace(/\D/g, "").slice(0, String(this.max).length);
          if (digits !== this.input.value) this.input.value = digits;
        },
        change: () => this.commitTyped(),
        focus: () => this.input.select(),
        keydown: ((e: KeyboardEvent) => {
          if (e.key === "Enter") {
            this.commitTyped();
            this.input.blur();
          } else if (e.key === "Escape") {
            this.input.value = String(this.value);
            this.input.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            this.step(e.key === "ArrowUp" ? 1 : -1);
            this.input.select();
          }
        }) as EventListener,
      },
    }) as HTMLInputElement;

    this.dec = this.button(-1, `Decrease ${opts.label.toLowerCase()}`, "−");
    this.inc = this.button(1, `Increase ${opts.label.toLowerCase()}`, "+");

    this.el = h("div", { class: "stepper" }, [this.dec, this.input, this.inc]);
    this.render();
  }

  /** Update from outside (e.g. the wheel) without calling onChange. */
  set(value: number, bounds?: { min?: number; max?: number }): void {
    if (bounds?.min != null) this.min = bounds.min;
    if (bounds?.max != null) this.max = bounds.max;
    this.value = value;
    this.render();
  }

  private button(dir: 1 | -1, label: string, glyph: string): HTMLButtonElement {
    const btn = h("button", {
      class: "stepper__btn",
      type: "button",
      attrs: { "aria-label": label },
      text: glyph,
    }) as HTMLButtonElement;

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); // keep focus (and the soft keyboard) off the input
      this.step(dir);
      let interval = REPEAT_START;
      const repeat = () => {
        if (!this.step(dir)) return this.stopRepeat();
        interval = Math.max(REPEAT_FASTEST, interval * 0.86);
        this.repeatTimer = window.setTimeout(repeat, interval);
      };
      this.repeatTimer = window.setTimeout(repeat, REPEAT_DELAY);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"] as const) {
      btn.addEventListener(ev, () => this.stopRepeat());
    }
    // Keyboard activation (Enter / Space) arrives as a click with no pointer.
    btn.addEventListener("click", (e) => {
      if (e.detail === 0) this.step(dir);
    });
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    return btn;
  }

  private stopRepeat(): void {
    window.clearTimeout(this.repeatTimer);
    this.repeatTimer = undefined;
  }

  /** Returns false once the value can go no further. */
  private step(dir: 1 | -1): boolean {
    const next = Math.min(this.max, Math.max(this.min, this.value + dir));
    if (next === this.value) return false;
    this.value = next;
    this.render();
    this.onChange(next);
    return true;
  }

  private commitTyped(): void {
    const typed = parseInt(this.input.value, 10);
    if (Number.isNaN(typed)) {
      this.input.value = String(this.value);
      return;
    }
    const next = Math.min(this.max, Math.max(this.min, typed));
    this.input.value = String(next);
    if (next === this.value) return;
    this.value = next;
    this.render();
    this.onChange(next);
  }

  private render(): void {
    if (document.activeElement !== this.input || this.input.value !== String(this.value)) {
      this.input.value = String(this.value);
    }
    this.dec.disabled = this.value <= this.min;
    this.inc.disabled = this.value >= this.max;
    if (this.dec.disabled || this.inc.disabled) this.stopRepeat();
  }
}
