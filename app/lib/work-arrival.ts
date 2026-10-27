import {
  coveringPenalty,
  formatPenaltyCharge,
  penaltyAmountToCents,
  type PenaltyUnit,
} from "@/lib/penalty";
import {
  DEFAULT_TIMEZONE,
  WEEKDAYS,
  coveringEntry,
  formatTimeInZone,
  isValidTimeZone,
  localDateTime,
  weekdayOfDate,
  type Weekday,
} from "@/lib/sleep";

export const DEFAULT_BLOCK_MINUTES = 10;
export const DEFAULT_ARRIVAL_MINUTES = 9 * 60;
export const DEFAULT_RADIUS_METERS = 100;
export const MAX_RADIUS_METERS = 1_000_000;
export const MAX_BLOCK_MINUTES = 24 * 60;

const EARTH_RADIUS_METERS = 6_371_000;
const TIME_OF_DAY = /^(\d{1,2}):(\d{2})$/;

export type WeekdayChecklist = Record<Weekday, boolean>;

export type WorkArrivalTargetForCharge = {
  effectiveFrom: string;
  timezone: string;
  arrivalMinutes: number;
  days: WeekdayChecklist;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type WorkArrivalOverrideForCharge = {
  date: string;
  timezone: string;
  arrivalMinutes: number;
};

export type WorkArrivalPenaltyForCharge = {
  effectiveFrom: string;
  amount: string;
  unit: PenaltyUnit;
  unitLabel: string | null;
  blockMinutes: number;
  cap: string;
};

export type CheckInPoint = {
  arrivedAt: Date;
  latitude: number;
  longitude: number;
};

export type WorkArrivalChargeCell = {
  time: string | null;
  /** True when the day counts and the check-in is missing or outside the place. */
  miss: boolean;
  /** True when the check-in is inside the place and after the target. */
  late: boolean;
  charge: string | null;
};

export function defaultWorkdays(): WeekdayChecklist {
  return {
    0: false,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: false,
  };
}

export function weekdayChecklistToJson(
  days: WeekdayChecklist,
): Record<string, boolean> {
  return {
    "0": days[0],
    "1": days[1],
    "2": days[2],
    "3": days[3],
    "4": days[4],
    "5": days[5],
    "6": days[6],
  };
}

export function parseWeekdayChecklist(value: unknown): WeekdayChecklist | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const days = {} as WeekdayChecklist;
  for (const day of WEEKDAYS) {
    const raw = record[String(day)];
    if (typeof raw !== "boolean") return null;
    days[day] = raw;
  }
  return days;
}

export function checklistFromWeekdays(selected: readonly string[]): WeekdayChecklist {
  const chosen = new Set(selected);
  const days = {} as WeekdayChecklist;
  for (const day of WEEKDAYS) {
    days[day] = chosen.has(String(day));
  }
  return days;
}

export function parseArrivalMinutes(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  const match = TIME_OF_DAY.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatArrivalMinutes(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatArrivalInput(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseLatitude(raw: unknown): number | null {
  return parseCoordinate(raw, -90, 90);
}

export function parseLongitude(raw: unknown): number | null {
  return parseCoordinate(raw, -180, 180);
}

export function formatLatitude(value: number): string | null {
  return formatCoordinate(value, -90, 90);
}

export function formatLongitude(value: number): string | null {
  return formatCoordinate(value, -180, 180);
}

function formatCoordinate(value: number, min: number, max: number): string | null {
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return (Math.round(value * 1e7) / 1e7).toFixed(7);
}

export function calendarDateInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Work-day calendar date for a check-in instant, in the covering target's timezone. */
export function workDayForArrival(
  targets: { effectiveFrom: string; timezone: string }[],
  instant: Date,
): { workDay: string; timezone: string } {
  const ordered = [...targets].sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom),
  );
  for (const target of ordered) {
    if (!isValidTimeZone(target.timezone)) continue;
    const workDay = calendarDateInTimeZone(instant, target.timezone);
    if (target.effectiveFrom <= workDay) {
      return { workDay, timezone: target.timezone };
    }
  }
  return {
    workDay: calendarDateInTimeZone(instant, DEFAULT_TIMEZONE),
    timezone: DEFAULT_TIMEZONE,
  };
}

function parseCoordinate(raw: unknown, min: number, max: number): number | null {
  const text = String(raw ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return Math.round(value * 1e7) / 1e7;
}

export function parseRadiusMeters(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > MAX_RADIUS_METERS) return null;
  return value;
}

export function parseBlockMinutes(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > MAX_BLOCK_MINUTES) return null;
  return value;
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideRadius(
  point: { latitude: number; longitude: number },
  place: { latitude: number; longitude: number; radiusMeters: number },
): boolean {
  return distanceMeters(point, place) <= place.radiusMeters;
}

/** The earlier instant wins. An equal instant keeps the check-in already stored. */
export function earlierCheckIn(
  existing: CheckInPoint | null,
  incoming: CheckInPoint,
): CheckInPoint {
  if (!existing || incoming.arrivedAt.getTime() < existing.arrivedAt.getTime()) {
    return incoming;
  }
  return existing;
}

function clockForDay(
  target: WorkArrivalTargetForCharge | undefined,
  override: WorkArrivalOverrideForCharge | undefined,
): { timezone: string; arrivalMinutes: number } | null {
  if (override) {
    return {
      timezone: override.timezone,
      arrivalMinutes: override.arrivalMinutes,
    };
  }
  if (!target) return null;
  return {
    timezone: target.timezone,
    arrivalMinutes: target.arrivalMinutes,
  };
}

function dayCounts(
  date: string,
  target: WorkArrivalTargetForCharge | undefined,
  override: WorkArrivalOverrideForCharge | undefined,
): boolean {
  if (override) return true;
  if (!target) return false;
  return target.days[weekdayOfDate(date)];
}

function latenessBlocks(lateMs: number, blockMinutes: number): number {
  if (lateMs <= 0 || blockMinutes < 1) return 0;
  return Math.ceil(lateMs / (blockMinutes * 60 * 1000));
}

export function chargeWorkArrivalDay(input: {
  date: string;
  targets: WorkArrivalTargetForCharge[];
  overrides: WorkArrivalOverrideForCharge[];
  penalties: WorkArrivalPenaltyForCharge[];
  checkIn: CheckInPoint | null;
}): {
  counts: boolean;
  miss: boolean;
  late: boolean;
  blocks: number;
  cents: number;
  timezone: string | null;
  arrivedAt: Date | null;
} {
  const target = coveringEntry(input.targets, input.date);
  const override = input.overrides.find((entry) => entry.date === input.date);
  const counts = dayCounts(input.date, target, override);
  const clock = clockForDay(target, override);
  const arrivedAt = input.checkIn?.arrivedAt ?? null;

  if (!counts || !clock) {
    return {
      counts: false,
      miss: false,
      late: false,
      blocks: 0,
      cents: 0,
      timezone: clock?.timezone ?? target?.timezone ?? null,
      arrivedAt,
    };
  }

  const penalty = coveringPenalty(input.penalties, input.date);
  const capCents = penalty ? penaltyAmountToCents(penalty.cap) : 0;
  const inside =
    input.checkIn !== null &&
    target !== undefined &&
    isInsideRadius(input.checkIn, target);

  if (!inside) {
    return {
      counts: true,
      miss: true,
      late: false,
      blocks: 0,
      cents: capCents,
      timezone: clock.timezone,
      arrivedAt,
    };
  }

  const targetInstant = localDateTime(
    input.date,
    clock.arrivalMinutes,
    clock.timezone,
  );
  const lateMs = input.checkIn!.arrivedAt.getTime() - targetInstant.getTime();
  if (lateMs <= 0) {
    return {
      counts: true,
      miss: false,
      late: false,
      blocks: 0,
      cents: 0,
      timezone: clock.timezone,
      arrivedAt,
    };
  }

  const blocks = latenessBlocks(
    lateMs,
    penalty?.blockMinutes ?? DEFAULT_BLOCK_MINUTES,
  );
  const rawCents = penalty
    ? blocks * penaltyAmountToCents(penalty.amount)
    : 0;
  return {
    counts: true,
    miss: false,
    late: true,
    blocks,
    cents: Math.min(rawCents, capCents),
    timezone: clock.timezone,
    arrivedAt,
  };
}

export function chargeWorkArrivalMonth(input: {
  dates: string[];
  targets: WorkArrivalTargetForCharge[];
  overrides: WorkArrivalOverrideForCharge[];
  penalties: WorkArrivalPenaltyForCharge[];
  checkInByWorkDay: ReadonlyMap<string, CheckInPoint | null>;
}): {
  cells: Record<string, WorkArrivalChargeCell>;
  totalCharge: string;
} {
  const cells: Record<string, WorkArrivalChargeCell> = {};
  let totalCents = 0;

  for (const date of input.dates) {
    const charged = chargeWorkArrivalDay({
      date,
      targets: input.targets,
      overrides: input.overrides,
      penalties: input.penalties,
      checkIn: input.checkInByWorkDay.get(date) ?? null,
    });
    totalCents += charged.cents;
    const penalty = coveringPenalty(input.penalties, date);
    const time =
      charged.arrivedAt && charged.timezone
        ? formatTimeInZone(charged.arrivedAt, charged.timezone)
        : null;
    const owes = charged.miss || charged.late;
    cells[date] = {
      time,
      miss: charged.miss,
      late: charged.late,
      charge: owes
        ? formatPenaltyCharge(charged.cents, penalty?.unit, penalty?.unitLabel)
        : null,
    };
  }

  const latestPenalty = coveringPenalty(
    input.penalties,
    input.dates[input.dates.length - 1] ?? "",
  );
  return {
    cells,
    totalCharge: formatPenaltyCharge(
      totalCents,
      latestPenalty?.unit,
      latestPenalty?.unitLabel,
    ),
  };
}

export function checkInPoint(
  arrivedAt: Date | null,
  latitude: number | null,
  longitude: number | null,
): CheckInPoint | null {
  if (arrivedAt === null || latitude === null || longitude === null) return null;
  return { arrivedAt, latitude, longitude };
}
