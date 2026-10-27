import { expect, test } from "vitest";
import { localDateTime } from "@/lib/sleep";
import {
  chargeWorkArrivalMonth,
  defaultWorkdays,
  distanceMeters,
  earlierCheckIn,
  formatLatitude,
  isInsideRadius,
  parseLatitude,
  workDayForArrival,
  type WorkArrivalPenaltyForCharge,
  type WorkArrivalTargetForCharge,
} from "@/lib/work-arrival";

const PLACE = { latitude: 1.3, longitude: 103.8, radiusMeters: 100 };
const DAY = "2026-10-27";

function target(
  days = defaultWorkdays(),
  arrivalMinutes = 9 * 60,
): WorkArrivalTargetForCharge {
  return {
    effectiveFrom: "2026-01-01",
    timezone: "Asia/Singapore",
    arrivalMinutes,
    days,
    ...PLACE,
  };
}

function penalty(
  overrides: Partial<WorkArrivalPenaltyForCharge> = {},
): WorkArrivalPenaltyForCharge {
  return {
    effectiveFrom: "2026-01-01",
    amount: "1.50",
    unit: "MONEY",
    unitLabel: null,
    blockMinutes: 10,
    cap: "5.00",
    ...overrides,
  };
}

function at(minutes: number, extraMs = 0): Date {
  return new Date(localDateTime(DAY, minutes, "Asia/Singapore").getTime() + extraMs);
}

function charge(input: {
  date?: string;
  targets?: WorkArrivalTargetForCharge[];
  overrides?: { date: string; timezone: string; arrivalMinutes: number }[];
  penalties?: WorkArrivalPenaltyForCharge[];
  checkIn?: { arrivedAt: Date; latitude: number; longitude: number } | null;
}) {
  return chargeWorkArrivalMonth({
    dates: [input.date ?? DAY],
    targets: input.targets ?? [target()],
    overrides: input.overrides ?? [],
    penalties: input.penalties ?? [penalty()],
    checkInByWorkDay: new Map([[input.date ?? DAY, input.checkIn ?? null]]),
  });
}

test("an unchecked weekday owes nothing, including when nobody checks in", () => {
  const sunday = "2026-10-25";
  const result = charge({ date: sunday, checkIn: null });
  expect(result.cells[sunday]).toEqual({
    time: null,
    miss: false,
    late: false,
    charge: null,
  });
  expect(result.totalCharge).toBe("$0.00");
});

test("a missing check-in on a counted day owes the cap", () => {
  const result = charge({ checkIn: null });
  expect(result.cells[DAY]).toEqual({
    time: null,
    miss: true,
    late: false,
    charge: "$5.00",
  });
});

test("a check-in inside the radius and on time owes nothing", () => {
  const result = charge({
    checkIn: { arrivedAt: at(9 * 60), ...PLACE },
  });
  expect(result.cells[DAY]).toMatchObject({
    time: "9:00 AM",
    miss: false,
    late: false,
    charge: null,
  });
});

test("ten minutes late is one block", () => {
  const result = charge({
    checkIn: { arrivedAt: at(9 * 60 + 10), ...PLACE },
  });
  expect(result.cells[DAY]).toMatchObject({
    late: true,
    miss: false,
    charge: "$1.50",
  });
});

test("a partial block rounds up", () => {
  const result = charge({
    checkIn: { arrivedAt: at(9 * 60 + 10, 1), ...PLACE },
  });
  expect(result.cells[DAY].charge).toBe("$3.00");
});

test("late blocks stop at the cap", () => {
  const result = charge({
    checkIn: { arrivedAt: at(12 * 60), ...PLACE },
  });
  expect(result.cells[DAY]).toMatchObject({
    late: true,
    charge: "$5.00",
  });
});

test("a check-in outside the radius owes the cap", () => {
  const result = charge({
    checkIn: {
      arrivedAt: at(8 * 60),
      latitude: 1.31,
      longitude: 103.8,
    },
  });
  expect(result.cells[DAY]).toMatchObject({
    miss: true,
    late: false,
    charge: "$5.00",
  });
});

test("the radius boundary counts as inside", () => {
  expect(distanceMeters(PLACE, PLACE)).toBe(0);
  expect(isInsideRadius(PLACE, { ...PLACE, radiusMeters: 0 })).toBe(true);
  expect(
    isInsideRadius(
      { latitude: 1.31, longitude: 103.8 },
      { ...PLACE, radiusMeters: 0 },
    ),
  ).toBe(false);
});

test("an override makes an unchecked day count and replaces the clock time", () => {
  const sunday = "2026-10-25";
  const arrivedAt = localDateTime(sunday, 10 * 60, "Asia/Singapore");
  const result = charge({
    date: sunday,
    overrides: [
      {
        date: sunday,
        timezone: "Asia/Singapore",
        arrivalMinutes: 11 * 60,
      },
    ],
    checkIn: { arrivedAt, latitude: PLACE.latitude, longitude: PLACE.longitude },
  });
  expect(result.cells[sunday]).toMatchObject({
    time: "10:00 AM",
    miss: false,
    late: false,
    charge: null,
  });
});

test("an override still uses the target place", () => {
  const result = charge({
    overrides: [
      { date: DAY, timezone: "Asia/Singapore", arrivalMinutes: 9 * 60 },
    ],
    checkIn: {
      arrivedAt: at(8 * 60),
      latitude: 1.31,
      longitude: 103.8,
    },
  });
  expect(result.cells[DAY].miss).toBe(true);
  expect(result.cells[DAY].charge).toBe("$5.00");
});

test("a counted day with no geofence is a miss", () => {
  const result = charge({
    date: DAY,
    targets: [],
    overrides: [
      { date: DAY, timezone: "Asia/Singapore", arrivalMinutes: 9 * 60 },
    ],
    checkIn: { arrivedAt: at(8 * 60), ...PLACE },
  });
  expect(result.cells[DAY]).toMatchObject({ miss: true, charge: "$5.00" });
});

test("the latest target on or before the day covers it", () => {
  const later = target();
  later.effectiveFrom = "2026-10-28";
  later.latitude = 10;
  const result = charge({
    targets: [later, target()],
    checkIn: { arrivedAt: at(9 * 60), ...PLACE },
  });
  expect(result.cells[DAY].miss).toBe(false);
  expect(result.cells[DAY].charge).toBeNull();
});

test("a check-in work day follows the covering target timezone", () => {
  const instant = new Date("2026-10-27T16:30:00.000Z");
  expect(
    workDayForArrival(
      [{ effectiveFrom: "2026-01-01", timezone: "America/New_York" }],
      instant,
    ),
  ).toEqual({ workDay: "2026-10-27", timezone: "America/New_York" });
  expect(
    workDayForArrival(
      [{ effectiveFrom: "2026-01-01", timezone: "Asia/Singapore" }],
      instant,
    ),
  ).toEqual({ workDay: "2026-10-28", timezone: "Asia/Singapore" });
});

test("a target that has not started does not set the work day", () => {
  const instant = new Date("2026-10-27T04:00:00.000Z");
  expect(
    workDayForArrival(
      [{ effectiveFrom: "2026-11-01", timezone: "America/New_York" }],
      instant,
    ),
  ).toEqual({ workDay: "2026-10-27", timezone: "Asia/Singapore" });
});

test("the newest covering target sets the work day", () => {
  const instant = new Date("2026-10-27T16:30:00.000Z");
  expect(
    workDayForArrival(
      [
        { effectiveFrom: "2026-01-01", timezone: "Asia/Singapore" },
        { effectiveFrom: "2026-06-01", timezone: "America/New_York" },
      ],
      instant,
    ).timezone,
  ).toBe("America/New_York");
});

test("a device coordinate round-trips into a stored latitude", () => {
  expect(parseLatitude(formatLatitude(1.35208337))).toBe(1.3520834);
});

test("an earlier check-in sticks", () => {
  const first = { arrivedAt: at(9 * 60), ...PLACE };
  const later = { arrivedAt: at(10 * 60), latitude: 1.31, longitude: 103.8 };
  expect(earlierCheckIn(first, later)).toBe(first);
  expect(earlierCheckIn(later, first)).toEqual(first);
  expect(earlierCheckIn(null, first)).toBe(first);
});
