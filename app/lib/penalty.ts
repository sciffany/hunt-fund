export const PENALTY_UNITS = ["MONEY", "CHORE", "OTHER"] as const;

export type PenaltyUnit = (typeof PENALTY_UNITS)[number];

export const PENALTY_UNIT_LABELS: Record<PenaltyUnit, string> = {
  MONEY: "Money",
  CHORE: "Chores",
  OTHER: "Other (please specify)",
};

export const DEFAULT_PENALTY_AMOUNT = "1";
export const MAX_UNIT_LABEL_LENGTH = 40;
export const MAX_PENALTY_AMOUNT = 99_999_999.99;

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function isPenaltyUnit(value: string): value is PenaltyUnit {
  return (PENALTY_UNITS as readonly string[]).includes(value);
}

export function parsePenaltyUnit(raw: unknown): PenaltyUnit | null {
  const value = String(raw ?? "").trim();
  return isPenaltyUnit(value) ? value : null;
}

export function parsePenaltyAmount(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!AMOUNT_PATTERN.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > MAX_PENALTY_AMOUNT) {
    return null;
  }
  return text;
}

export function parsePenaltyUnitLabel(
  unit: PenaltyUnit,
  raw: unknown,
): { label: string | null; error?: string } {
  const label = String(raw ?? "").trim();
  if (unit !== "OTHER") {
    return { label: null };
  }
  if (!label) {
    return { label: null, error: "Specify the custom penalty unit." };
  }
  if (label.length > MAX_UNIT_LABEL_LENGTH) {
    return {
      label: null,
      error: `Keep the custom unit to ${MAX_UNIT_LABEL_LENGTH} characters or fewer.`,
    };
  }
  return { label };
}

export function formatPenaltyAmount(amount: { toString(): string } | string | number): string {
  const text = typeof amount === "number" ? amount.toString() : amount.toString();
  if (!AMOUNT_PATTERN.test(text)) {
    const value = Number(text);
    if (!Number.isFinite(value)) return DEFAULT_PENALTY_AMOUNT;
    return value.toFixed(2);
  }
  return text;
}

export type CoveringPenalty = {
  effectiveFrom: string;
  amount: string;
  unit: PenaltyUnit;
  unitLabel: string | null;
};

export function coveringPenalty<T extends { effectiveFrom: string }>(
  penalties: T[],
  onDate: string,
): T | undefined {
  let covering: T | undefined;
  for (const penalty of penalties) {
    if (penalty.effectiveFrom > onDate) continue;
    if (!covering || penalty.effectiveFrom >= covering.effectiveFrom) {
      covering = penalty;
    }
  }
  return covering;
}

export function penaltyAmountToCents(amount: string | number): number {
  const text = formatPenaltyAmount(amount);
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

export function nightlyPenaltyCents(
  halfHours: number,
  amount: string | number,
): number {
  if (halfHours <= 0) return 0;
  return penaltyAmountToCents(amount) * halfHours;
}

export function stepPenaltyCents(
  units: number,
  amount: string | number,
): number {
  if (units <= 0) return 0;
  return penaltyAmountToCents(amount) * units;
}

function formatChargeNumber(cents: number, unit?: PenaltyUnit): string {
  const text = (cents / 100).toFixed(2);
  if (unit === "MONEY") return text;
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}

export function formatPenaltyCharge(
  cents: number,
  unit?: PenaltyUnit,
  unitLabel?: string | null,
): string {
  const number = formatChargeNumber(cents, unit);
  if (unit === "CHORE") return `${number} chores`;
  if (unit === "OTHER" && unitLabel) return `${number} ${unitLabel}`;
  return number;
}
