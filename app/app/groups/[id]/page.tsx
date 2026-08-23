import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  GroupMonthDashboard,
  type DashboardCell,
} from "@/components/GroupMonthDashboard";
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
} from "@/lib/penalty";
import { prisma } from "@/lib/prisma";
import { displayNameOf, requireOnboardedUser } from "@/lib/session";
import {
  DEFAULT_TIMEZONE,
  bedtimeForNight,
  bedtimeInstant,
  defaultSleepTimes,
  formatDateOnly,
  formatRoundedLastActivity,
  nightOverdue,
  parseDateOnly,
  parseSleepTimes,
  todayInTimeZone,
} from "@/lib/sleep";

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
            },
          },
          sleepSchedules: {
            select: { effectiveFrom: true, timezone: true, times: true },
            orderBy: { effectiveFrom: "asc" },
          },
          sleepOverrides: {
            select: { date: true, timezone: true, halfHoursPast8pm: true },
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
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!group) notFound();

  return (
    <AppShell wide>
      <p className="text-sm text-neutral-500">
        <Link href="/home" className="hover:text-neutral-900">
          Home
        </Link>
        <span className="mx-1">/</span>
        {group.name}
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{group.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {group.members.length}{" "}
            {group.members.length === 1 ? "member" : "members"}
          </p>
        </div>
        {isOwner ? (
          <Link
            href={`/groups/${group.id}/settings`}
            className="text-sm text-neutral-500 hover:text-neutral-900"
          >
            Settings
          </Link>
        ) : (
          <form action={leaveGroup}>
            <input type="hidden" name="groupId" value={group.id} />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100"
            >
              Leave group
            </button>
          </form>
        )}
      </div>

      <GroupMonthDashboard
        groupId={group.id}
        month={month}
        today={todayInTimeZone(DEFAULT_TIMEZONE)}
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
    </AppShell>
  );
}
