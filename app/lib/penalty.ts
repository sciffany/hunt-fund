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
