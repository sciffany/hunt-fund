export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type SleepTimesByWeekday = Record<Weekday, number>;

export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export const MIN_HALF_HOURS_PAST_8PM = 0;
export const MAX_HALF_HOURS_PAST_8PM = 20;
export const DEFAULT_TIMEZONE = "Asia/Singapore";
export const DEFAULT_HALF_HOURS_PAST_8PM = 7; // 11:30 PM

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const COMMON_TIMEZONES = [
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

export function isValidHalfHoursPast8pm(value: number): boolean {
  return Number.isInteger(value) &&
    value >= MIN_HALF_HOURS_PAST_8PM &&
    value <= MAX_HALF_HOURS_PAST_8PM;
}

export function formatHalfHoursPast8pm(value: number): string {
  const minutesFromMidnight = 20 * 60 + value * 30;
  const hour24 = Math.floor(minutesFromMidnight / 60) % 24;
  const minute = minutesFromMidnight % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function bedtimeOptions(): { value: number; label: string }[] {
  const options: { value: number; label: string }[] = [];
  for (let i = MIN_HALF_HOURS_PAST_8PM; i <= MAX_HALF_HOURS_PAST_8PM; i++) {
    options.push({ value: i, label: formatHalfHoursPast8pm(i) });
  }
  return options;
}

export function parseHalfHoursPast8pm(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!isValidHalfHoursPast8pm(value)) return null;
  return value;
}

export function defaultSleepTimes(): SleepTimesByWeekday {
  return {
    0: DEFAULT_HALF_HOURS_PAST_8PM,
    1: DEFAULT_HALF_HOURS_PAST_8PM,
    2: DEFAULT_HALF_HOURS_PAST_8PM,
    3: DEFAULT_HALF_HOURS_PAST_8PM,
    4: DEFAULT_HALF_HOURS_PAST_8PM,
    5: DEFAULT_HALF_HOURS_PAST_8PM,
    6: DEFAULT_HALF_HOURS_PAST_8PM,
  };
}

export function parseSleepTimes(value: unknown): SleepTimesByWeekday | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const times = {} as SleepTimesByWeekday;
  for (const day of WEEKDAYS) {
    const raw = (value as Record<string, unknown>)[String(day)];
    const parsed = parseHalfHoursPast8pm(raw);
    if (parsed === null) return null;
    times[day] = parsed;
  }
  return times;
}

export function sleepTimesToJson(times: SleepTimesByWeekday): Record<string, number> {
  return {
    "0": times[0],
    "1": times[1],
    "2": times[2],
    "3": times[3],
    "4": times[4],
    "5": times[5],
    "6": times[6],
  };
}

export function parseDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!DATE_ONLY.test(trimmed)) return null;
  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayInTimeZone(timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function listTimeZones(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [...COMMON_TIMEZONES];
  const rest = supported.filter(
    (zone) => !COMMON_TIMEZONES.includes(zone as (typeof COMMON_TIMEZONES)[number]),
  );
  return [...COMMON_TIMEZONES, ...rest];
}

export function coveringTimezone(
  schedules: { effectiveFrom: string; timezone: string }[],
  onDate: string,
): string {
  const covering = schedules
    .filter((schedule) => schedule.effectiveFrom <= onDate)
    .at(-1);
  return covering?.timezone ?? schedules[0]?.timezone ?? DEFAULT_TIMEZONE;
}
