import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ConfirmForm } from "@/components/ConfirmForm";
import { InviteForm } from "@/components/forms";
import { SleepTrackingSettings } from "@/components/SleepTrackingSettings";
import { deleteGroup } from "@/lib/actions/groups";
import { prisma } from "@/lib/prisma";
import { displayNameOf, requireOnboardedUser } from "@/lib/session";
import { formatPenaltyAmount } from "@/lib/penalty";
import {
  DEFAULT_TIMEZONE,
  defaultSleepTimes,
  formatDateOnly,
  listTimeZones,
  parseSleepTimes,
  todayInTimeZone,
} from "@/lib/sleep";
import {
  defaultWorkdays,
  parseWeekdayChecklist,
} from "@/lib/work-arrival";

export const metadata: Metadata = {
  title: "Group settings",
};

export default async function GroupSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireOnboardedUser();
  const { id } = await params;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: user.id } },
  });
  if (!membership || membership.role !== "OWNER") notFound();

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              name: true,
              email: true,
            },
          },
          sleepSchedules: { orderBy: { effectiveFrom: "asc" } },
          sleepOverrides: { orderBy: { date: "asc" } },
          sleepPenalties: { orderBy: { effectiveFrom: "asc" } },
          stepTargets: { orderBy: { effectiveFrom: "asc" } },
          stepPenalties: { orderBy: { effectiveFrom: "asc" } },
          workArrivalTargets: { orderBy: { effectiveFrom: "asc" } },
          workArrivalOverrides: { orderBy: { date: "asc" } },
          workArrivalPenalties: { orderBy: { effectiveFrom: "asc" } },
        },
        orderBy: { joinedAt: "asc" },
      },
      invites: {
        where: { status: "PENDING" },
        include: {
          recipient: {
            select: { username: true, displayName: true, name: true, email: true },
          },
          sender: { select: { username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!group) notFound();

  const sleepTrackingEnabled = group.trackingKinds.includes(
    "SLEEP_TIME_GADGET_USAGE",
  );
  const stepTrackingEnabled = group.trackingKinds.includes("DAILY_STEPS");
  const arrivalTrackingEnabled = group.trackingKinds.includes("WORK_ARRIVAL_TIME");

  return (
    <AppShell>
      <p className="text-sm text-neutral-500">
        <Link href="/home" className="hover:text-neutral-900">
          Home
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/groups/${group.id}`} className="hover:text-neutral-900">
          {group.name}
        </Link>
        <span className="mx-1">/</span>
        Settings
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {group.name} settings
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Only you can see this page.
          </p>
        </div>
        <ConfirmForm
          action={deleteGroup}
          hidden={{ groupId: group.id }}
          confirmMessage="Delete this group and all of its invites? This can’t be undone."
          className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
        >
          Delete group
        </ConfirmForm>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-500">Members</h2>
        <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
          {group.members.map((member) => (
            <li key={member.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{displayNameOf(member.user)}</p>
                <p className="text-xs text-neutral-500">
                  {member.user.username
                    ? `@${member.user.username}`
                    : member.user.email ?? "No username yet"}
                </p>
              </div>
              <span className="text-xs text-neutral-500">
                {member.role === "OWNER" ? "Owner" : "Member"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <SleepTrackingSettings
        groupId={group.id}
        sleepTrackingEnabled={sleepTrackingEnabled}
        stepTrackingEnabled={stepTrackingEnabled}
        arrivalTrackingEnabled={arrivalTrackingEnabled}
        timeZones={listTimeZones()}
        defaultDate={todayInTimeZone(DEFAULT_TIMEZONE)}
        members={group.members.map((member) => ({
          id: member.id,
          displayName: displayNameOf(member.user),
          username: member.user.username,
          role: member.role,
          schedules: member.sleepSchedules.map((schedule) => ({
            id: schedule.id,
            effectiveFrom: formatDateOnly(schedule.effectiveFrom),
            timezone: schedule.timezone,
            times: parseSleepTimes(schedule.times) ?? defaultSleepTimes(),
          })),
          overrides: member.sleepOverrides.map((override) => ({
            id: override.id,
            date: formatDateOnly(override.date),
            timezone: override.timezone,
            halfHoursPast8pm: override.halfHoursPast8pm,
            note: override.note,
          })),
          penalties: member.sleepPenalties.map((penalty) => ({
            id: penalty.id,
            effectiveFrom: formatDateOnly(penalty.effectiveFrom),
            amount: formatPenaltyAmount(penalty.amount),
            unit: penalty.unit,
            unitLabel: penalty.unitLabel,
          })),
        }))}
        stepMembers={group.members.map((member) => ({
          id: member.id,
          displayName: displayNameOf(member.user),
          username: member.user.username,
          role: member.role,
          targets: member.stepTargets.map((target) => ({
            id: target.id,
            effectiveFrom: formatDateOnly(target.effectiveFrom),
            targetSteps: target.targetSteps,
          })),
          penalties: member.stepPenalties.map((penalty) => ({
            id: penalty.id,
            effectiveFrom: formatDateOnly(penalty.effectiveFrom),
            amount: formatPenaltyAmount(penalty.amount),
            unit: penalty.unit,
            unitLabel: penalty.unitLabel,
          })),
        }))}
        arrivalMembers={group.members.map((member) => ({
          id: member.id,
          displayName: displayNameOf(member.user),
          username: member.user.username,
          role: member.role,
          targets: member.workArrivalTargets.map((target) => ({
            id: target.id,
            effectiveFrom: formatDateOnly(target.effectiveFrom),
            timezone: target.timezone,
            arrivalMinutes: target.arrivalMinutes,
            days: parseWeekdayChecklist(target.days) ?? defaultWorkdays(),
            latitude: target.latitude.toString(),
            longitude: target.longitude.toString(),
            radiusMeters: target.radiusMeters,
          })),
          overrides: member.workArrivalOverrides.map((override) => ({
            id: override.id,
            date: formatDateOnly(override.date),
            timezone: override.timezone,
            arrivalMinutes: override.arrivalMinutes,
            note: override.note,
          })),
          penalties: member.workArrivalPenalties.map((penalty) => ({
            id: penalty.id,
            effectiveFrom: formatDateOnly(penalty.effectiveFrom),
            amount: formatPenaltyAmount(penalty.amount),
            unit: penalty.unit,
            unitLabel: penalty.unitLabel,
            blockMinutes: penalty.blockMinutes,
            cap: formatPenaltyAmount(penalty.cap),
          })),
        }))}
      />

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-500">Invite someone</h2>
        <p className="mt-1 text-sm text-neutral-600">
          They’ll be added after they accept. If they don’t have an account yet,
          we’ll save their email so they can join when they sign up.
        </p>
        <div className="mt-4 rounded-md border border-neutral-200 bg-white p-4">
          <InviteForm groupId={group.id} />
        </div>
      </section>

      {group.invites.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-neutral-500">Pending invites</h2>
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
            {group.invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {displayNameOf(invite.recipient)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {invite.recipient.username
                      ? `@${invite.recipient.username}`
                      : "Not signed up yet"}
                    {invite.sender.username
                      ? ` · invited by @${invite.sender.username}`
                      : ""}
                  </p>
                </div>
                <span className="text-xs text-neutral-500">Pending</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
