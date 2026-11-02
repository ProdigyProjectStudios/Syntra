/** A bounded speech envelope: quick enough for syllables, soft enough to avoid flashes. */
export function smoothSpeechLevel(previous: number, input: number, dt: number) {
  const level = Number.isFinite(input) ? Math.max(0, Math.min(1, input)) : 0;
  const target = 0.035 + 0.42 * (1 - Math.exp(-1.8 * level));
  const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
  const timeConstant = target > previous ? 0.12 : 0.28;
  return previous + (target - previous) * (1 - Math.exp(-seconds / timeConstant));
}

/** Integrate speed, rather than multiplying elapsed time by a changing speed. */
export function advanceSpeechPhase(phase: number, dt: number, level: number) {
  return phase + dt * (1 + level * 0.22);
}
