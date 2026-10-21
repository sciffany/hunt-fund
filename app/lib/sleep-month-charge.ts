import {
  coveringPenalty,
  formatPenaltyCharge,
  nightlyPenaltyCents,
  type PenaltyUnit,
} from "@/lib/penalty";
import {
  bedtimeForNight,
  bedtimeInstant,
  formatRoundedLastActivity,
  nightOverdue,
  type SleepTimesByWeekday,
} from "@/lib/sleep";

export type SleepScheduleForCharge = {
  effectiveFrom: string;
  timezone: string;
  times: SleepTimesByWeekday;
};

export type SleepOverrideForCharge = {
  date: string;
  timezone: string;
  halfHoursPast8pm: number;
};

export type SleepPenaltyForCharge = {
  effectiveFrom: string;
  amount: string;
  unit: PenaltyUnit;
  unitLabel: string | null;
};

export type SleepNightChargeCell = {
  time: string | null;
  missedBedtime: boolean;
  charge: string | null;
};

export function chargeSleepMonth(input: {
  dates: string[];
  schedules: SleepScheduleForCharge[];
  overrides: SleepOverrideForCharge[];
  penalties: SleepPenaltyForCharge[];
  lastActivityBySleepNight: ReadonlyMap<string, Date>;
}): {
  cells: Record<string, SleepNightChargeCell>;
  totalCharge: string;
} {
  const cells: Record<string, SleepNightChargeCell> = {};
  let totalCents = 0;

  for (const date of input.dates) {
    const bedtime = bedtimeForNight(input.schedules, input.overrides, date);
    const lastActivity = input.lastActivityBySleepNight.get(date);
    const penalty = coveringPenalty(input.penalties, date);
    if (!lastActivity) {
      cells[date] = { time: null, missedBedtime: false, charge: null };
      continue;
    }

    const { overdue, halfHours } = nightOverdue(
      lastActivity,
      bedtimeInstant(date, bedtime.halfHoursPast8pm, bedtime.timezone),
    );
    const cents = penalty ? nightlyPenaltyCents(halfHours, penalty.amount) : 0;
    totalCents += cents;
    cells[date] = {
      time: formatRoundedLastActivity(lastActivity, bedtime.timezone),
      missedBedtime: overdue,
      charge: overdue
        ? formatPenaltyCharge(cents, penalty?.unit, penalty?.unitLabel)
        : null,
    };
  }

  const latestPenalty = coveringPenalty(
    input.penalties,
    input.dates[input.dates.length - 1],
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
