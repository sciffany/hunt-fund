import { expect, test } from "vitest";
import { defaultSleepTimes } from "@/lib/sleep";
import { chargeSleepMonth } from "@/lib/sleep-month-charge";

test("a sleep night one half-hour past bedtime owes $1.50", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-21"],
    schedules: [
      {
        effectiveFrom: "2026-01-01",
        timezone: "Asia/Singapore",
        times: defaultSleepTimes(),
      },
    ],
    overrides: [],
    penalties: [
      {
        effectiveFrom: "2026-01-01",
        amount: "1.50",
        unit: "MONEY",
        unitLabel: null,
      },
    ],
    lastActivityBySleepNight: new Map([
      ["2026-10-21", new Date("2026-10-21T16:00:00.000Z")],
    ]),
  });

  expect(result.cells["2026-10-21"]).toEqual({
    time: "12:00 AM",
    missedBedtime: true,
    charge: "$1.50",
  });
});

test("a sleep night at bedtime has no charge", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-21"],
    schedules: [singaporeSchedule("2026-01-01", defaultSleepTimes())],
    overrides: [],
    penalties: [moneyPenalty("2026-01-01", "1.50")],
    lastActivityBySleepNight: new Map([
      ["2026-10-21", new Date("2026-10-21T15:30:00.000Z")],
    ]),
  });

  expect(result.cells["2026-10-21"]).toEqual({
    time: "11:30 PM",
    missedBedtime: false,
    charge: null,
  });
});

test("a sleep night with no last activity stays empty", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-21"],
    schedules: [singaporeSchedule("2026-01-01", defaultSleepTimes())],
    overrides: [],
    penalties: [moneyPenalty("2026-01-01", "1.50")],
    lastActivityBySleepNight: new Map(),
  });

  expect(result.cells["2026-10-21"]).toEqual({
    time: null,
    missedBedtime: false,
    charge: null,
  });
});

test("a missed bedtime with no penalty shows a zero charge", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-21"],
    schedules: [singaporeSchedule("2026-01-01", defaultSleepTimes())],
    overrides: [],
    penalties: [],
    lastActivityBySleepNight: new Map([
      ["2026-10-21", new Date("2026-10-21T16:00:00.000Z")],
    ]),
  });

  expect(result.cells["2026-10-21"]).toEqual({
    time: "12:00 AM",
    missedBedtime: true,
    charge: "0",
  });
});

test("a partial half-hour rounds up", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-21"],
    schedules: [singaporeSchedule("2026-01-01", defaultSleepTimes())],
    overrides: [],
    penalties: [moneyPenalty("2026-01-01", "1.50")],
    lastActivityBySleepNight: new Map([
      ["2026-10-21", new Date("2026-10-21T16:10:00.000Z")],
    ]),
  });

  expect(result.cells["2026-10-21"]).toEqual({
    time: "12:30 AM",
    missedBedtime: true,
    charge: "$3.00",
  });
});

test("an override replaces the schedule bedtime", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-21"],
    schedules: [singaporeSchedule("2026-01-01", defaultSleepTimes())],
    overrides: [
      {
        date: "2026-10-21",
        timezone: "Asia/Singapore",
        halfHoursPast8pm: 0,
      },
    ],
    penalties: [moneyPenalty("2026-01-01", "1.00")],
    lastActivityBySleepNight: new Map([
      ["2026-10-21", new Date("2026-10-21T13:00:00.000Z")],
    ]),
  });

  expect(result.cells["2026-10-21"]).toEqual({
    time: "9:00 PM",
    missedBedtime: true,
    charge: "$2.00",
  });
});

test("a sleep night with no schedule uses the default bedtime", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-21"],
    schedules: [],
    overrides: [],
    penalties: [moneyPenalty("2026-01-01", "1.50")],
    lastActivityBySleepNight: new Map([
      ["2026-10-21", new Date("2026-10-21T16:00:00.000Z")],
    ]),
  });

  expect(result.cells["2026-10-21"]).toEqual({
    time: "12:00 AM",
    missedBedtime: true,
    charge: "$1.50",
  });
});

test("the schedule covering the sleep night sets bedtime", () => {
  const early = defaultSleepTimes();
  const later = defaultSleepTimes();
  for (const day of [0, 1, 2, 3, 4, 5, 6] as const) later[day] = 8;

  const result = chargeSleepMonth({
    dates: ["2026-09-30", "2026-10-21"],
    schedules: [
      singaporeSchedule("2026-01-01", early),
      singaporeSchedule("2026-10-01", later),
    ],
    overrides: [],
    penalties: [moneyPenalty("2026-01-01", "1.50")],
    lastActivityBySleepNight: new Map([
      ["2026-09-30", new Date("2026-09-30T16:00:00.000Z")],
      ["2026-10-21", new Date("2026-10-21T16:00:00.000Z")],
    ]),
  });

  expect(result.cells["2026-09-30"]).toEqual({
    time: "12:00 AM",
    missedBedtime: true,
    charge: "$1.50",
  });
  expect(result.cells["2026-10-21"]).toEqual({
    time: "12:00 AM",
    missedBedtime: false,
    charge: null,
  });
});

test("the month total uses the penalty that covers the last day", () => {
  const result = chargeSleepMonth({
    dates: ["2026-10-01", "2026-10-31"],
    schedules: [singaporeSchedule("2026-01-01", defaultSleepTimes())],
    overrides: [],
    penalties: [
      moneyPenalty("2026-01-01", "1.00"),
      {
        effectiveFrom: "2026-10-15",
        amount: "2",
        unit: "CHORE",
        unitLabel: null,
      },
    ],
    lastActivityBySleepNight: new Map([
      ["2026-10-01", new Date("2026-10-01T16:00:00.000Z")],
      ["2026-10-31", new Date("2026-10-31T16:00:00.000Z")],
    ]),
  });

  expect(result.cells["2026-10-01"].charge).toBe("$1.00");
  expect(result.cells["2026-10-31"].charge).toBe("2 chores");
  expect(result.totalCharge).toBe("3 chores");
});

function singaporeSchedule(
  effectiveFrom: string,
  times: ReturnType<typeof defaultSleepTimes>,
) {
  return { effectiveFrom, timezone: "Asia/Singapore", times };
}

function moneyPenalty(effectiveFrom: string, amount: string) {
  return {
    effectiveFrom,
    amount,
    unit: "MONEY" as const,
    unitLabel: null,
  };
}
