import { announce } from "../announce";
import { MAX_DENOMINATOR, MIN_DENOMINATOR, describe, formatPercent, normalize, type Fraction } from "../core/wheel";
import { loadFraction, loadPreferences, saveFraction, savePreferences, type Preferences } from "../preferences";
import { playTick } from "../sound";
import { h } from "./dom";
import { Menu } from "./menu";
import { Stepper } from "./stepper";
import { Wheel } from "./wheel";

/** Denominators that make friendly percentages, for the "New fraction" button. */
const FRIENDLY_DENOMINATORS = [2, 3, 4, 5, 6, 8, 10, 12, 20, 25, 50, 100];

export class App {
  private root: HTMLElement;
  private prefs: Preferences;
  private fraction: Fraction;

  private numerator!: Stepper;
  private denominator!: Stepper;
  private percent!: HTMLElement;
  private wheel!: Wheel;
  private announceTimer: number | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    this.prefs = loadPreferences();
    this.fraction = loadFraction();
  }

  start(): void {
    new Menu(this.root, {
      prefs: this.prefs,
      onChange: (prefs) => this.applyPreferences(prefs),
    }).mount();
    document.documentElement.classList.toggle("reduced-motion", this.prefs.reducedMotion);

    const { numerator: n, denominator: d } = this.fraction;
    this.numerator = new Stepper({
      label: "Numerator",
      value: n,
      min: 0,
      max: d,
      onChange: (value) => this.update({ numerator: value, denominator: this.fraction.denominator }, "typed"),
    });
    this.denominator = new Stepper({
      label: "Denominator",
      value: d,
      min: MIN_DENOMINATOR,
      max: MAX_DENOMINATOR,
      onChange: (value) => this.update({ numerator: this.fraction.numerator, denominator: value }, "typed"),
    });
    this.percent = h("output", { class: "percent", attrs: { "aria-hidden": "true" } });

    this.wheel = new Wheel({
      fraction: this.fraction,
      showSlices: this.prefs.showSlices,
      reducedMotion: this.prefs.reducedMotion,
      onChange: (value) => this.update({ numerator: value, denominator: this.fraction.denominator }, "wheel"),
      onRelease: () => this.announceSoon(0),
    });

    const screen = h("main", { class: "screen", attrs: { id: "main" } }, [
      h("header", { class: "head" }, [
        h("h1", { class: "head__title", text: "Percent Wheel" }),
        h("p", { class: "head__hint", text: "Drag round the wheel, or change the numbers." }),
      ]),
      h("div", { class: "readout" }, [
        h("div", { class: "fraction", attrs: { role: "group", "aria-label": "Fraction" } }, [
          this.numerator.el,
          h("span", { class: "fraction__bar", attrs: { "aria-hidden": "true" } }),
          this.denominator.el,
        ]),
        this.percent,
      ]),
      this.wheel.el,
      h("div", { class: "controls" }, [
        h("button", {
          class: "btn btn--ghost",
          type: "button",
          text: "New fraction",
          on: { click: () => this.randomize() },
        }),
      ]),
    ]);
    this.root.append(screen);
    this.render();
  }

  private update(next: Fraction, source: "typed" | "wheel" | "random"): void {
    const prev = this.fraction;
    this.fraction = normalize(next);
    const { numerator: n, denominator: d } = this.fraction;
    if (n === prev.numerator && d === prev.denominator) return;

    this.numerator.set(n, { max: d });
    this.denominator.set(d);
    this.wheel.setFraction(this.fraction);
    this.render();
    saveFraction(this.fraction);

    if (source === "wheel") {
      playTick(n / d, this.prefs.sound);
    } else {
      // The wheel slider announces its own value while focused; everything
      // else gets a short, settled summary once the learner pauses.
      this.announceSoon(500);
    }
  }

  private randomize(): void {
    const choices = FRIENDLY_DENOMINATORS.filter((d) => d !== this.fraction.denominator);
    const d = choices[Math.floor(Math.random() * choices.length)]!;
    const n = 1 + Math.floor(Math.random() * (d - 1));
    this.update({ numerator: n, denominator: d }, "random");
  }

  private render(): void {
    const { text, exact } = formatPercent(this.fraction);
    this.percent.textContent = `${exact ? "=" : "≈"} ${text}`;
    this.percent.hidden = !this.prefs.showPercent;
  }

  private announceSoon(delay: number): void {
    window.clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => {
      announce(this.prefs.showPercent ? describe(this.fraction) : `${this.fraction.numerator} out of ${this.fraction.denominator}`);
    }, delay);
  }

  private applyPreferences(prefs: Preferences): void {
    this.prefs = prefs;
    savePreferences(prefs);
    this.wheel.setShowSlices(prefs.showSlices);
    this.wheel.setReducedMotion(prefs.reducedMotion);
    document.documentElement.classList.toggle("reduced-motion", prefs.reducedMotion);
    this.render();
  }
}
