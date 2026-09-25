/**
 * Very small, optional sound layer. Sound is never the only signal: every
 * change it marks is also drawn on the wheel and written in the fraction.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, duration: number, when = 0, gain = 0.05): void {
  const ac = context();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const t0 = ac.currentTime + when;
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

let lastTick = 0;

/** A short tick whose pitch rises with how much of the wheel is shaded. */
export function playTick(share: number, enabled: boolean): void {
  if (!enabled) return;
  // Fast drags across many slices would otherwise become a buzz.
  const now = performance.now();
  if (now - lastTick < 35) return;
  lastTick = now;
  if (share >= 1) {
    tone(523.25, 0.14, 0);
    tone(783.99, 0.2, 0.08);
    return;
  }
  tone(262 * Math.pow(2, share * 1.5), 0.07, 0, 0.04);
}
