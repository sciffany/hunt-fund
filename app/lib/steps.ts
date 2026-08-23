export const STEP_BLOCK = 500;
export const DEFAULT_TARGET_STEPS = 2000;
export const MAX_TARGET_STEPS = 1_000_000;

export function parseTargetSteps(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > MAX_TARGET_STEPS) {
    return null;
  }
  return value;
}

/** 500-step blocks below target. Partial blocks round up. */
export function stepShortfallUnits(steps: number, target: number): number {
  if (steps >= target) return 0;
  return Math.ceil((target - steps) / STEP_BLOCK);
}
