import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DashboardMonthNav } from "@/components/dashboard";
import {
  GroupMonthDashboard,
  type DashboardCell,
} from "@/components/GroupMonthDashboard";
import {
  GroupMonthStepsDashboard,
  type StepsDashboardCell,
} from "@/components/GroupMonthStepsDashboard";
import { leaveGroup } from "@/lib/actions/groups";
import {
  currentYearMonth,
  datesInMonth,
  parseYearMonth,
} from "@/lib/month";
import {
  coveringPenalty,
  formatPenaltyAmount,
  formatPenaltyCharge,
  nightlyPenaltyCents,
  stepPenaltyCents,
} from "@/lib/penalty";
import { stepShortfallUnits } from "@/lib/steps";
import { prisma } from "@/lib/prisma";
import { displayNameOf, requireOnboardedUser } from "@/lib/session";
import {
  DEFAULT_TIMEZONE,
  WEEKDAYS,
  WEEKDAY_LABELS,
  bedtimeForNight,
  bedtimeInstant,
  defaultSleepTimes,
  formatDateOnly,
  formatHalfHoursPast8pm,
  formatRoundedLastActivity,
  nightOverdue,
  parseDateOnly,
  parseSleepTimes,
  todayInTimeZone,
  type SleepTimesByWeekday,
  type Weekday,
} from "@/lib/sleep";

function sharedDateNotes(
  byDate: Map<string, { name: string; text: string }[]>,
  memberCount: number,
): Record<string, string[]> {
  const notes: Record<string, string[]> = {};
  for (const [date, items] of byDate) {
    if (items.length === 0) continue;
    const texts = new Set(items.map((item) => item.text));
    if (texts.size === 1 && (memberCount <= 1 || items.length === memberCount)) {
      notes[date] = [items[0].text];
      continue;
    }
    notes[date] = items.map((item) =>
      memberCount <= 1 ? item.text : `${item.name} · ${item.text}`,
    );
  }
  return notes;
}

function sleepTimeChangeText(
  previous: SleepTimesByWeekday,
  next: SleepTimesByWeekday,
): string | null {
  const changed = WEEKDAYS.filter((day) => previous[day] !== next[day]);
  if (changed.length === 0) return null;

  const dayLabel = (day: Weekday) => WEEKDAY_LABELS[day].slice(0, 3);
  const nextTimes = new Set(changed.map((day) => next[day]));
  if (nextTimes.size === 1) {
    const bedtime = formatHalfHoursPast8pm(next[changed[0]]);
    if (changed.length === WEEKDAYS.length) return `Bedtime ${bedtime}`;
    return `Bedtime ${bedtime} · ${changed.map(dayLabel).join(", ")}`;
  }

  return `Bedtime ${changed
    .map((day) => `${dayLabel(day)} ${formatHalfHoursPast8pm(next[day])}`)
    .join(", ")}`;
}

function sleepDateNotes(
  members: {
    user: Parameters<typeof displayNameOf>[0];
    sleepSchedules: {
      effectiveFrom: Date;
      times: unknown;
    }[];
    sleepOverrides: {
      date: Date;
      halfHoursPast8pm: number;
      note: string | null;
    }[];
  }[],
  dates: string[],
): Record<string, string[]> {
  const visible = new Set(dates);
  const byDate = new Map<string, { name: string; text: string }[]>();
  const push = (date: string, name: string, text: string) => {
    const list = byDate.get(date) ?? [];
    list.push({ name, text });
    byDate.set(date, list);
  };

  for (const member of members) {
    const name = displayNameOf(member.user);
    const schedules = [...member.sleepSchedules].sort((a, b) =>
      formatDateOnly(a.effectiveFrom).localeCompare(formatDateOnly(b.effectiveFrom)),
    );
    let previousTimes: SleepTimesByWeekday | null = null;
    for (const schedule of schedules) {
      const times = parseSleepTimes(schedule.times);
      if (!times) continue;
      const date = formatDateOnly(schedule.effectiveFrom);
      if (previousTimes && visible.has(date)) {
        const text = sleepTimeChangeText(previousTimes, times);
        if (text) push(date, name, text);
      }
      previousTimes = times;
    }

    for (const override of member.sleepOverrides) {
      const date = formatDateOnly(override.date);
      if (!visible.has(date)) continue;
      const bedtime = formatHalfHoursPast8pm(override.halfHoursPast8pm);
      const note = override.note?.trim();
      push(date, name, note ? `${note} · ${bedtime}` : `Override · ${bedtime}`);
    }
  }
  return sharedDateNotes(byDate, members.length);
}

function stepTargetDateNotes(
  members: {
    user: Parameters<typeof displayNameOf>[0];
    stepTargets: { effectiveFrom: Date; targetSteps: number }[];
  }[],
  dates: string[],
): Record<string, string[]> {
  const visible = new Set(dates);
  const byDate = new Map<string, { name: string; text: string }[]>();
  for (const member of members) {
    const name = displayNameOf(member.user);
    const targets = [...member.stepTargets].sort((a, b) =>
      formatDateOnly(a.effectiveFrom).localeCompare(formatDateOnly(b.effectiveFrom)),
    );
    let previousSteps: number | null = null;
    for (const target of targets) {
      const date = formatDateOnly(target.effectiveFrom);
      const changed =
        previousSteps !== null && target.targetSteps !== previousSteps;
      if (changed && visible.has(date)) {
        const text = `Target ${target.targetSteps.toLocaleString("en-US")}`;
        const list = byDate.get(date) ?? [];
        list.push({ name, text });
        byDate.set(date, list);
      }
      previousSteps = target.targetSteps;
    }
  }
  return sharedDateNotes(byDate, members.length);
}

export const metadata: Metadata = {
  title: "Group",
};

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const { month: monthParam } = await searchParams;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: user.id } },
  });
  if (!membership) notFound();

  const isOwner = membership.role === "OWNER";

  const month = parseYearMonth(monthParam) ?? currentYearMonth(DEFAULT_TIMEZONE);
  const dates = datesInMonth(month);
  const monthStart = parseDateOnly(dates[0]);
  const monthEnd = parseDateOnly(dates[dates.length - 1]);
  if (!monthStart || !monthEnd) notFound();

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              name: true,
              username: true,
              email: true,
              sleepNights: {
                where: { night: { gte: monthStart, lte: monthEnd } },
                select: { night: true, lastActivity: true },
              },
              stepNights: {
                where: { night: { gte: monthStart, lte: monthEnd } },
                select: { night: true, steps: true },
              },
            },
          },
          sleepSchedules: {
            select: { effectiveFrom: true, timezone: true, times: true },
            orderBy: { effectiveFrom: "asc" },
          },
          sleepOverrides: {
            select: {
              date: true,
              timezone: true,
              halfHoursPast8pm: true,
              note: true,
            },
          },
          sleepPenalties: {
            select: {
              effectiveFrom: true,
              amount: true,
              unit: true,
              unitLabel: true,
            },
            orderBy: { effectiveFrom: "asc" },
          },
          stepTargets: {
            select: { effectiveFrom: true, targetSteps: true },
            orderBy: { effectiveFrom: "asc" },
          },
          stepPenalties: {
            select: {
              effectiveFrom: true,
              amount: true,
              unit: true,
              unitLabel: true,
            },
            orderBy: { effectiveFrom: "asc" },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!group) notFound();

  const sleepTrackingEnabled = group.trackingKinds.includes(
    "SLEEP_TIME_GADGET_USAGE",
  );
  const stepTrackingEnabled = group.trackingKinds.includes("DAILY_STEPS");
  const memberCountLabel = `${group.members.length} ${
    group.members.length === 1 ? "member" : "members"
  }`;

  return (
    <AppShell wide>
      <p className="text-sm text-neutral-500">
        <Link href="/home" className="hover:text-neutral-900">
          Home
        </Link>
        <span className="mx-1.5 text-neutral-300">/</span>
        <span className="text-neutral-700">{group.name}</span>
      </p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{group.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{memberCountLabel}</p>
        </div>
        {isOwner ? (
          <Link
            href={`/groups/${group.id}/settings`}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            Settings
          </Link>
        ) : (
          <form action={leaveGroup}>
            <input type="hidden" name="groupId" value={group.id} />
            <button
              type="submit"
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
            >
              Leave group
            </button>
          </form>
        )}
      </div>

      {sleepTrackingEnabled || stepTrackingEnabled ? (
        <DashboardMonthNav groupId={group.id} month={month} />
      ) : (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          No tracking is enabled yet.
          {isOwner
            ? " Turn on sleep or step tracking in Settings."
            : " Ask the group owner to turn on sleep or step tracking."}
        </p>
      )}

      {sleepTrackingEnabled ? (
        <GroupMonthDashboard
          groupId={group.id}
          month={month}
          today={todayInTimeZone(DEFAULT_TIMEZONE)}
          dateNotes={sleepDateNotes(group.members, dates)}
          members={group.members.map((member) => {
          const schedules = member.sleepSchedules.map((schedule) => ({
            effectiveFrom: formatDateOnly(schedule.effectiveFrom),
            timezone: schedule.timezone,
            times: parseSleepTimes(schedule.times) ?? defaultSleepTimes(),
          }));
          const overrides = member.sleepOverrides.map((override) => ({
            date: formatDateOnly(override.date),
            timezone: override.timezone,
            halfHoursPast8pm: override.halfHoursPast8pm,
          }));
          const penalties = member.sleepPenalties.map((penalty) => ({
            effectiveFrom: formatDateOnly(penalty.effectiveFrom),
            amount: formatPenaltyAmount(penalty.amount),
            unit: penalty.unit,
            unitLabel: penalty.unitLabel,
          }));
          const nights = new Map(
            member.user.sleepNights.map((night) => [
              formatDateOnly(night.night),
              night.lastActivity,
            ]),
          );
          const cells: Record<string, DashboardCell> = {};
          let totalCents = 0;
          for (const date of dates) {
            const bedtimeSpec = bedtimeForNight(schedules, overrides, date);
            const lastActivity = nights.get(date);
            const penalty = coveringPenalty(penalties, date);
            if (!lastActivity) {
              cells[date] = { time: null, overdue: false, penaltyLabel: null };
              continue;
            }

            const { overdue, halfHours } = nightOverdue(
              lastActivity,
              bedtimeInstant(
                date,
                bedtimeSpec.halfHoursPast8pm,
                bedtimeSpec.timezone,
              ),
            );
            const cents = penalty
              ? nightlyPenaltyCents(halfHours, penalty.amount)
              : 0;
            totalCents += cents;
            cells[date] = {
              time: formatRoundedLastActivity(
                lastActivity,
                bedtimeSpec.timezone,
              ),
              overdue,
              penaltyLabel: overdue
                ? formatPenaltyCharge(cents, penalty?.unit, penalty?.unitLabel)
                : null,
            };
          }

          const latestPenalty = coveringPenalty(
            penalties,
            dates[dates.length - 1],
          );
          return {
            id: member.id,
            displayName: displayNameOf(member.user),
            cells,
            totalPenalty: formatPenaltyCharge(
              totalCents,
              latestPenalty?.unit,
              latestPenalty?.unitLabel,
            ),
          };
        })}
        />
      ) : null}

      {stepTrackingEnabled ? (
        <GroupMonthStepsDashboard
          groupId={group.id}
          month={month}
          today={todayInTimeZone(DEFAULT_TIMEZONE)}
          dateNotes={stepTargetDateNotes(group.members, dates)}
          members={group.members.map((member) => {
            const targets = member.stepTargets.map((target) => ({
              effectiveFrom: formatDateOnly(target.effectiveFrom),
              targetSteps: target.targetSteps,
            }));
            const penalties = member.stepPenalties.map((penalty) => ({
              effectiveFrom: formatDateOnly(penalty.effectiveFrom),
              amount: formatPenaltyAmount(penalty.amount),
              unit: penalty.unit,
              unitLabel: penalty.unitLabel,
            }));
            const nights = new Map(
              member.user.stepNights.map((night) => [
                formatDateOnly(night.night),
                night.steps,
              ]),
            );
            const cells: Record<string, StepsDashboardCell> = {};
            let totalCents = 0;
            for (const date of dates) {
              const steps = nights.get(date);
              const target = coveringPenalty(targets, date);
              const penalty = coveringPenalty(penalties, date);
              if (steps === undefined || !target) {
                cells[date] = { steps: steps ?? null, below: false, penaltyLabel: null };
                continue;
              }

              const units = stepShortfallUnits(steps, target.targetSteps);
              const below = units > 0;
              const cents = penalty ? stepPenaltyCents(units, penalty.amount) : 0;
              totalCents += cents;
              cells[date] = {
                steps,
                below,
                penaltyLabel: below
                  ? formatPenaltyCharge(cents, penalty?.unit, penalty?.unitLabel)
                  : null,
              };
            }

            const latestPenalty = coveringPenalty(
              penalties,
              dates[dates.length - 1],
            );
            return {
              id: member.id,
              displayName: displayNameOf(member.user),
              cells,
              totalPenalty: formatPenaltyCharge(
                totalCents,
                latestPenalty?.unit,
                latestPenalty?.unitLabel,
              ),
            };
          })}
        />
      ) : null}
    </AppShell>
  );
}
