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
/** How far back a night can be recomputed from raw events. */
export const REFRESH_WINDOW_DAYS = 7;
/** Raw sleep events older than this can be pruned; cached nights are kept. */
export const EVENT_RETENTION_DAYS = 14;

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

export function shiftDateOnly(dateOnly: string, days: number): string | null {
  const date = parseDateOnly(dateOnly);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

/** True iff `night` is within the last `REFRESH_WINDOW_DAYS` of `today`. */
export function isNightRefreshable(
  night: string,
  today: string = todayInTimeZone(),
): boolean {
  const cutoff = shiftDateOnly(today, -REFRESH_WINDOW_DAYS);
  return cutoff !== null && DATE_ONLY.test(night) && night >= cutoff;
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

export function weekdayOfDate(dateOnly: string): Weekday {
  const parsed = parseDateOnly(dateOnly);
  return (parsed ? parsed.getUTCDay() : 0) as Weekday;
}

export function coveringEntry<T extends { effectiveFrom: string }>(
  entries: T[],
  onDate: string,
): T | undefined {
  let covering: T | undefined;
  for (const entry of entries) {
    if (entry.effectiveFrom > onDate) continue;
    if (!covering || entry.effectiveFrom >= covering.effectiveFrom) {
      covering = entry;
    }
  }
  return covering;
}

export function coveringTimezone(
  schedules: { effectiveFrom: string; timezone: string }[],
  onDate: string,
): string {
  const covering = coveringEntry(schedules, onDate);
  return covering?.timezone ?? schedules[0]?.timezone ?? DEFAULT_TIMEZONE;
}

export type NightBedtime = {
  timezone: string;
  halfHoursPast8pm: number;
};

export function bedtimeForNight(
  schedules: {
    effectiveFrom: string;
    timezone: string;
    times: SleepTimesByWeekday;
  }[],
  overrides: { date: string; timezone: string; halfHoursPast8pm: number }[],
  onDate: string,
): NightBedtime {
  const override = overrides.find((entry) => entry.date === onDate);
  if (override) {
    return {
      timezone: override.timezone,
      halfHoursPast8pm: override.halfHoursPast8pm,
    };
  }

  const schedule = coveringEntry(schedules, onDate);
  if (schedule) {
    return {
      timezone: schedule.timezone,
      halfHoursPast8pm: schedule.times[weekdayOfDate(onDate)],
    };
  }

  return {
    timezone: schedules[0]?.timezone ?? DEFAULT_TIMEZONE,
    halfHoursPast8pm: DEFAULT_HALF_HOURS_PAST_8PM,
  };
}

export function timezoneForNight(
  schedules: { effectiveFrom: string; timezone: string }[],
  overrides: { date: string; timezone: string }[],
  onDate: string,
): string {
  const override = overrides.find((entry) => entry.date === onDate);
  if (override) return override.timezone;
  return coveringTimezone(schedules, onDate);
}

const HALF_HOUR_MS = 30 * 60 * 1000;

export function ceilToHalfHour(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS);
}

export function formatTimeInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const period = parts
    .find((part) => part.type === "dayPeriod")
    ?.value.toUpperCase();
  return `${hour}:${minute} ${period}`;
}

export function formatRoundedLastActivity(
  lastActivity: Date,
  timeZone: string,
): string {
  return formatTimeInZone(ceilToHalfHour(lastActivity), timeZone);
}

function zoneWallParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  let year = Number(values.year);
  let month = Number(values.month);
  let day = Number(values.day);
  let hour = Number(values.hour);
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }

  return {
    year,
    month,
    day,
    hour,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = zoneWallParts(new Date(utc), timeZone);
    const seen = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = target - seen;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export function bedtimeInstant(
  nightDate: string,
  halfHoursPast8pm: number,
  timeZone: string,
): Date {
  const parsed = parseDateOnly(nightDate);
  if (!parsed) {
    throw new Error(`Invalid night date: ${nightDate}`);
  }

  const totalMinutes = 20 * 60 + halfHoursPast8pm * 30;
  const dayOffset = Math.floor(totalMinutes / (24 * 60));
  const minuteOfDay = totalMinutes % (24 * 60);
  const rolled = new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate() + dayOffset,
    ),
  );

  return zonedWallTimeToUtc(
    rolled.getUTCFullYear(),
    rolled.getUTCMonth() + 1,
    rolled.getUTCDate(),
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
    timeZone,
  );
}

export function nightOverdue(
  lastActivity: Date,
  bedtime: Date,
): { overdue: boolean; halfHours: number } {
  if (lastActivity.getTime() <= bedtime.getTime()) {
    return { overdue: false, halfHours: 0 };
  }

  const rounded = ceilToHalfHour(lastActivity);
  const halfHours = Math.max(
    0,
    Math.round((rounded.getTime() - bedtime.getTime()) / HALF_HOUR_MS),
  );
  return { overdue: true, halfHours };
}

/** Local 8:00 PM on the night-anchor date through 6:00 AM the next morning. */
export function nightActivityWindow(
  nightDate: string,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: bedtimeInstant(nightDate, MIN_HALF_HOURS_PAST_8PM, timeZone),
    end: bedtimeInstant(nightDate, MAX_HALF_HOURS_PAST_8PM, timeZone),
  };
}

export const LAST_ACTIVITY_EVENT_TYPES = [
  "ACTIVITY",
  "PHONE_ACTIVITY",
  "APP_CLOSE",
] as const;

export type LastActivityEventType = (typeof LAST_ACTIVITY_EVENT_TYPES)[number];

function isLastActivityEventType(value: string): value is LastActivityEventType {
  return (LAST_ACTIVITY_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Latest gadget activity in [start, end). An `APP_CLOSE` as the last event
 * means we can't tell when they actually stopped, so treat that as still up
 * at the end of the window (6:00 AM).
 */
export function lastActivityInWindow(
  events: { eventType: string; eventTime: Date }[],
  start: Date,
  end: Date,
): Date | null {
  let latest: { eventType: string; eventTime: Date } | null = null;
  const startMs = start.getTime();
  const endMs = end.getTime();

  for (const event of events) {
    if (!isLastActivityEventType(event.eventType)) continue;
    const time = event.eventTime.getTime();
    if (time < startMs || time >= endMs) continue;
    if (!latest || time > latest.eventTime.getTime()) latest = event;
  }

  if (!latest) return null;
  if (latest.eventType === "APP_CLOSE") return end;
  return latest.eventTime;
}
