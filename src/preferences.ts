import { normalize, type Fraction } from "./core/wheel";

export interface Preferences {
  /** Show the percentage beside the fraction. */
  showPercent: boolean;
  /** Draw a line for every slice of the wheel. */
  showSlices: boolean;
  /** Play a soft tick as each slice is shaded. */
  sound: boolean;
  /** Jump straight to new values instead of sweeping the wheel. */
  reducedMotion: boolean;
}

const PREFS_KEY = "percentwheel.prefs.v1";
const FRACTION_KEY = "percentwheel.fraction.v1";

function systemReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable; preferences are non-essential */
  }
}

export function loadPreferences(): Preferences {
  const stored = read<Partial<Preferences>>(PREFS_KEY) ?? {};
  return {
    showPercent: stored.showPercent ?? true,
    showSlices: stored.showSlices ?? true,
    sound: stored.sound ?? false,
    // Honor the OS setting unless the learner has explicitly overridden it.
    reducedMotion: stored.reducedMotion ?? systemReducedMotion(),
  };
}

export function savePreferences(prefs: Preferences): void {
  write(PREFS_KEY, prefs);
}

/** The last fraction on screen, so a reload picks up where the learner left off. */
export function loadFraction(): Fraction {
  const stored = read<Partial<Fraction>>(FRACTION_KEY);
  if (!stored || typeof stored.numerator !== "number" || typeof stored.denominator !== "number") {
    return { numerator: 3, denominator: 4 };
  }
  return normalize({ numerator: stored.numerator, denominator: stored.denominator });
}

export function saveFraction(f: Fraction): void {
  write(FRACTION_KEY, f);
}
