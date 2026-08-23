import { formatDateOnly, todayInTimeZone } from "@/lib/sleep";

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type YearMonth = {
  year: number;
  month: number;
};

export function parseYearMonth(value: string | undefined | null): YearMonth | null {
  if (!value) return null;
  const match = YEAR_MONTH.exec(value.trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function currentYearMonth(timeZone: string): YearMonth {
  const [year, month] = todayInTimeZone(timeZone).split("-").map(Number);
  return { year, month };
}

export function shiftYearMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function datesInMonth(yearMonth: YearMonth): string[] {
  const days = daysInMonth(yearMonth);
  return Array.from({ length: days }, (_, index) =>
    formatDateOnly(new Date(Date.UTC(yearMonth.year, yearMonth.month - 1, index + 1))),
  );
}

export function formatMonthLabel({ year, month }: YearMonth): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function weekdayShort(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function dayOfMonth(dateOnly: string): number {
  return Number(dateOnly.slice(8, 10));
}
