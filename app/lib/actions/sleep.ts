"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { hasPendingInvite } from "@/lib/pending-members";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/actions/profile";
import { requireOnboardedUser } from "@/lib/session";
import {
  parsePenaltyAmount,
  parsePenaltyUnit,
  parsePenaltyUnitLabel,
} from "@/lib/penalty";
import {
  DEFAULT_TIMEZONE,
  EVENT_RETENTION_DAYS,
  LAST_ACTIVITY_EVENT_TYPES,
  REFRESH_WINDOW_DAYS,
  decidingEvent,
  decidingEventNote,
  formatDateOnly,
  formatTimeInZone,
  isNightRefreshable,
  isValidTimeZone,
  lastActivityInWindow,
  nightActivityWindow,
  parseDateOnly,
  parseHalfHoursPast8pm,
  parseSleepTimes,
  sleepTimesToJson,
  timezoneForNight,
  todayInTimeZone,
  WEEKDAYS,
  type SleepTimesByWeekday,
} from "@/lib/sleep";

async function requireOwnedGroup(userId: string, groupId: string) {
  if (!groupId) return null;
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.ownerId !== userId) return null;
  return group;
}

function revalidateGroup(groupId: string) {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);
}

function uniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function updateGroupTracking(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return { error: "You can’t edit this group." };

  const sleepEnabled = formData.get("sleepTracking") === "on";
  const stepEnabled = formData.get("stepTracking") === "on";
  const arrivalEnabled = formData.get("workArrivalTracking") === "on";
  const trackingKinds = [
    ...(sleepEnabled ? (["SLEEP_TIME_GADGET_USAGE"] as const) : []),
    ...(stepEnabled ? (["DAILY_STEPS"] as const) : []),
    ...(arrivalEnabled ? (["WORK_ARRIVAL_TIME"] as const) : []),
  ];
  await prisma.group.update({
    where: { id: groupId },
    data: { trackingKinds: [...trackingKinds] },
  });

  revalidateGroup(groupId);
  return {
    success: trackingMessage(sleepEnabled, stepEnabled, arrivalEnabled),
  };
}

function trackingMessage(
  sleepEnabled: boolean,
  stepEnabled: boolean,
  arrivalEnabled: boolean,
) {
  if (sleepEnabled && stepEnabled && arrivalEnabled) {
    return "Sleep, daily step, and work arrival tracking are on.";
  }
  if (sleepEnabled && stepEnabled) {
    return "Sleep and daily step tracking are on.";
  }
  if (sleepEnabled && arrivalEnabled) {
    return "Sleep and work arrival tracking are on.";
  }
  if (stepEnabled && arrivalEnabled) {
    return "Daily step and work arrival tracking are on.";
  }
  if (sleepEnabled) return "Sleep tracking is on. Customize bedtimes below.";
  if (stepEnabled) return "Daily step tracking is on. Set targets below.";
  if (arrivalEnabled) {
    return "Work arrival tracking is on. Set a target, place, and penalty below.";
  }
  return "Tracking is off.";
}

function timesFromForm(formData: FormData): SleepTimesByWeekday | null {
  const raw: Record<string, unknown> = {};
  for (const day of WEEKDAYS) {
    raw[String(day)] = formData.get(`time-${day}`);
  }
  return parseSleepTimes(raw);
}

export async function saveSleepSchedule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const groupMemberId = String(formData.get("groupMemberId") ?? "");
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "");

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return { error: "You can’t edit this group." };

  const member = await prisma.groupMember.findUnique({
    where: { id: groupMemberId },
  });
  if (!member || member.groupId !== groupId) {
    return { error: "That member isn’t in this group." };
  }

  const effectiveFrom = parseDateOnly(effectiveFromRaw);
  if (!effectiveFrom) return { error: "Enter a valid starting date." };
  if (!isValidTimeZone(timezone)) return { error: "Choose a valid timezone." };

  const times = timesFromForm(formData);
  if (!times) {
    return { error: "Set a bedtime for every day of the week (8:00 PM–6:00 AM)." };
  }

  const data = {
    effectiveFrom,
    timezone,
    times: sleepTimesToJson(times),
  };

  try {
    if (scheduleId) {
      const existing = await prisma.sleepSchedule.findUnique({
        where: { id: scheduleId },
      });
      if (!existing || existing.groupMemberId !== groupMemberId) {
        return { error: "That schedule wasn’t found." };
      }
      await prisma.sleepSchedule.update({
        where: { id: scheduleId },
        data,
      });
    } else {
      await prisma.sleepSchedule.create({
        data: { groupMemberId, ...data },
      });
    }
  } catch (error) {
    if (uniqueConstraintError(error)) {
      return { error: "This member already has a schedule starting on that date." };
    }
    throw error;
  }

  revalidateGroup(groupId);
  return { success: scheduleId ? "Schedule saved." : "Schedule added." };
}

export async function deleteSleepSchedule(formData: FormData) {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const scheduleId = String(formData.get("scheduleId") ?? "");

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return;

  const existing = await prisma.sleepSchedule.findUnique({
    where: { id: scheduleId },
    include: { groupMember: { select: { groupId: true } } },
  });
  if (!existing || existing.groupMember.groupId !== groupId) return;

  await prisma.sleepSchedule.delete({ where: { id: scheduleId } });
  revalidateGroup(groupId);
}

export async function saveSleepOverride(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const groupMemberId = String(formData.get("groupMemberId") ?? "");
  const overrideId = String(formData.get("overrideId") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const dateRaw = String(formData.get("date") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return { error: "You can’t edit this group." };

  const member = await prisma.groupMember.findUnique({
    where: { id: groupMemberId },
  });
  if (!member || member.groupId !== groupId) {
    return { error: "That member isn’t in this group." };
  }

  const date = parseDateOnly(dateRaw);
  if (!date) return { error: "Enter a valid night date." };
  if (!isValidTimeZone(timezone)) return { error: "Choose a valid timezone." };

  const halfHoursPast8pm = parseHalfHoursPast8pm(formData.get("halfHoursPast8pm"));
  if (halfHoursPast8pm === null) {
    return { error: "Choose a bedtime between 8:00 PM and 6:00 AM." };
  }

  const data = { date, timezone, halfHoursPast8pm, note };

  try {
    if (overrideId) {
      const existing = await prisma.sleepOverride.findUnique({
        where: { id: overrideId },
      });
      if (!existing || existing.groupMemberId !== groupMemberId) {
        return { error: "That override wasn’t found." };
      }
      await prisma.sleepOverride.update({
        where: { id: overrideId },
        data,
      });
    } else {
      await prisma.sleepOverride.create({
        data: { groupMemberId, ...data },
      });
    }
  } catch (error) {
    if (uniqueConstraintError(error)) {
      return { error: "This member already has an override on that night." };
    }
    throw error;
  }

  revalidateGroup(groupId);
  return { success: overrideId ? "Override saved." : "Override added." };
}

export async function deleteSleepOverride(formData: FormData) {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const overrideId = String(formData.get("overrideId") ?? "");

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return;

  const existing = await prisma.sleepOverride.findUnique({
    where: { id: overrideId },
    include: { groupMember: { select: { groupId: true } } },
  });
  if (!existing || existing.groupMember.groupId !== groupId) return;

  await prisma.sleepOverride.delete({ where: { id: overrideId } });
  revalidateGroup(groupId);
}

export async function saveSleepPenalty(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const groupMemberId = String(formData.get("groupMemberId") ?? "");
  const penaltyId = String(formData.get("penaltyId") ?? "").trim();
  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "");

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return { error: "You can’t edit this group." };

  const member = await prisma.groupMember.findUnique({
    where: { id: groupMemberId },
  });
  if (!member || member.groupId !== groupId) {
    return { error: "That member isn’t in this group." };
  }

  const effectiveFrom = parseDateOnly(effectiveFromRaw);
  if (!effectiveFrom) return { error: "Enter a valid starting date." };

  const amount = parsePenaltyAmount(formData.get("amount"));
  if (amount === null) {
    return { error: "Enter a non-negative amount with at most two decimal places." };
  }

  const unit = parsePenaltyUnit(formData.get("unit"));
  if (!unit) return { error: "Choose a penalty unit." };

  const { label: unitLabel, error: unitLabelError } = parsePenaltyUnitLabel(
    unit,
    formData.get("unitLabel"),
  );
  if (unitLabelError) return { error: unitLabelError };

  const data = { effectiveFrom, amount, unit, unitLabel };

  try {
    if (penaltyId) {
      const existing = await prisma.sleepPenalty.findUnique({
        where: { id: penaltyId },
      });
      if (!existing || existing.groupMemberId !== groupMemberId) {
        return { error: "That penalty wasn’t found." };
      }
      await prisma.sleepPenalty.update({
        where: { id: penaltyId },
        data,
      });
    } else {
      await prisma.sleepPenalty.create({
        data: { groupMemberId, ...data },
      });
    }
  } catch (error) {
    if (uniqueConstraintError(error)) {
      return { error: "This member already has a penalty starting on that date." };
    }
    throw error;
  }

  revalidateGroup(groupId);
  return { success: penaltyId ? "Penalty saved." : "Penalty added." };
}

export async function deleteSleepPenalty(formData: FormData) {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const penaltyId = String(formData.get("penaltyId") ?? "");

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return;

  const existing = await prisma.sleepPenalty.findUnique({
    where: { id: penaltyId },
    include: { groupMember: { select: { groupId: true } } },
  });
  if (!existing || existing.groupMember.groupId !== groupId) return;

  await prisma.sleepPenalty.delete({ where: { id: penaltyId } });
  revalidateGroup(groupId);
}

export type RefreshSleepNightResult =
  | { ok: true; night: string; updated: number }
  | { ok: false; error: string };

export async function refreshSleepNight(
  groupId: string,
  nightRaw: string,
): Promise<RefreshSleepNightResult> {
  const user = await requireOnboardedUser();
  const night = parseDateOnly(nightRaw);
  if (!groupId || !night) {
    return { ok: false, error: "Pick a valid night to refresh." };
  }

  const nightKey = formatDateOnly(night);
  if (!isNightRefreshable(nightKey, todayInTimeZone(DEFAULT_TIMEZONE))) {
    return {
      ok: false,
      error: `Nights older than ${REFRESH_WINDOW_DAYS} days can’t be refreshed.`,
    };
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!membership) {
    return { ok: false, error: "You aren’t in this group." };
  }

  const updated = await recomputeGroupSleepNight(groupId, night, nightKey);
  revalidateGroup(groupId);
  return { ok: true, night: nightKey, updated };
}

async function recomputeGroupSleepNight(
  groupId: string,
  night: Date,
  nightKey: string,
  userId?: string,
): Promise<number> {
  const members = await prisma.groupMember.findMany({
    where: { groupId, ...(userId ? { userId } : {}) },
    include: {
      sleepSchedules: {
        select: { effectiveFrom: true, timezone: true },
        orderBy: { effectiveFrom: "asc" },
      },
      sleepOverrides: {
        where: { date: night },
        select: { date: true, timezone: true },
      },
    },
  });

  const windows = members.map((member) => {
    const schedules = member.sleepSchedules.map((schedule) => ({
      effectiveFrom: formatDateOnly(schedule.effectiveFrom),
      timezone: schedule.timezone,
    }));
    const overrides = member.sleepOverrides.map((override) => ({
      date: formatDateOnly(override.date),
      timezone: override.timezone,
    }));
    const rawTimezone = timezoneForNight(schedules, overrides, nightKey);
    const timezone = isValidTimeZone(rawTimezone)
      ? rawTimezone
      : DEFAULT_TIMEZONE;
    const { start, end } = nightActivityWindow(nightKey, timezone);
    return { userId: member.userId, start, end };
  });

  if (windows.length === 0) return 0;

  const minStart = new Date(Math.min(...windows.map((window) => window.start.getTime())));
  const maxEnd = new Date(Math.max(...windows.map((window) => window.end.getTime())));

  const events = await prisma.sleepEvent.findMany({
    where: {
      userId: { in: windows.map((window) => window.userId) },
      eventType: { in: [...LAST_ACTIVITY_EVENT_TYPES] },
      eventTime: { gte: minStart, lte: maxEnd },
    },
    select: { userId: true, eventType: true, eventTime: true },
    orderBy: { eventTime: "desc" },
  });

  const eventsByUser = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByUser.get(event.userId);
    if (list) list.push(event);
    else eventsByUser.set(event.userId, [event]);
  }

  const rows = windows.map((window) => ({
    userId: window.userId,
    lastActivity: lastActivityInWindow(
      eventsByUser.get(window.userId) ?? [],
      window.start,
      window.end,
    ),
  }));

  await prisma.$transaction(
    rows.map((row) =>
      prisma.sleepNight.upsert({
        where: { userId_night: { userId: row.userId, night } },
        create: {
          userId: row.userId,
          night,
          lastActivity: row.lastActivity,
        },
        update: { lastActivity: row.lastActivity },
      }),
    ),
  );

  return rows.length;
}

export type PruneSleepEventsResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

export async function pruneOldSleepEvents(
  groupId: string,
): Promise<PruneSleepEventsResult> {
  const user = await requireOnboardedUser();
  if (!groupId) return { ok: false, error: "Pick a group." };

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!membership) {
    return { ok: false, error: "You aren’t in this group." };
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  const cutoff = new Date(
    Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.sleepEvent.deleteMany({
    where: {
      userId: { in: members.map((member) => member.userId) },
      eventTime: { lt: cutoff },
    },
  });

  revalidateGroup(groupId);
  return { ok: true, deleted: result.count };
}

const SLEEP_EVENT_LABELS: Record<string, string> = {
  ACTIVITY: "Desktop activity",
  PHONE_ACTIVITY: "Phone activity",
  APP_CLOSE: "Desktop tracker stopped",
  PHONE_SESSION_START: "Phone session started",
  PHONE_SESSION_END: "Phone session ended",
  APP_START: "Tracker started",
  SYSTEM_SHUTDOWN: "Computer shut down",
};

function formatEventStamp(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

async function activityWindowForMember(
  groupMemberId: string,
  night: Date,
  nightKey: string,
) {
  const member = await prisma.groupMember.findUnique({
    where: { id: groupMemberId },
    include: {
      sleepSchedules: {
        select: { effectiveFrom: true, timezone: true },
        orderBy: { effectiveFrom: "asc" },
      },
      sleepOverrides: {
        where: { date: night },
        select: { date: true, timezone: true },
      },
    },
  });
  if (!member) return null;

  const schedules = member.sleepSchedules.map((schedule) => ({
    effectiveFrom: formatDateOnly(schedule.effectiveFrom),
    timezone: schedule.timezone,
  }));
  const overrides = member.sleepOverrides.map((override) => ({
    date: formatDateOnly(override.date),
    timezone: override.timezone,
  }));
  const rawTimezone = timezoneForNight(schedules, overrides, nightKey);
  const timezone = isValidTimeZone(rawTimezone) ? rawTimezone : DEFAULT_TIMEZONE;
  const { start, end } = nightActivityWindow(nightKey, timezone);
  return { userId: member.userId, groupId: member.groupId, timezone, start, end };
}

export type SleepNightEventView = {
  id: string;
  label: string;
  timeLabel: string;
  decides: boolean;
  note: string | null;
};

export type SleepNightEventsResult =
  | {
      ok: true;
      canDelete: boolean;
      countedAtLabel: string | null;
      events: SleepNightEventView[];
    }
  | { ok: false; error: string };

export async function listSleepNightEvents(
  groupId: string,
  groupMemberId: string,
  nightRaw: string,
): Promise<SleepNightEventsResult> {
  const user = await requireOnboardedUser();
  const night = parseDateOnly(nightRaw);
  if (!groupId || !groupMemberId || !night) {
    return { ok: false, error: "Pick a valid night." };
  }

  const viewer = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    include: { group: { select: { ownerId: true } } },
  });
  if (!viewer) return { ok: false, error: "You aren’t in this group." };

  const nightKey = formatDateOnly(night);
  const window = await activityWindowForMember(groupMemberId, night, nightKey);
  if (!window || window.groupId !== groupId) {
    return { ok: false, error: "That member isn’t in this group." };
  }
  if (await hasPendingInvite(groupId, window.userId)) {
    return { ok: false, error: "They haven’t joined this group yet." };
  }

  const events = await prisma.sleepEvent.findMany({
    where: {
      userId: window.userId,
      eventType: { in: [...LAST_ACTIVITY_EVENT_TYPES] },
      eventTime: { gte: window.start, lte: window.end },
    },
    select: { id: true, eventType: true, eventTime: true },
    orderBy: { eventTime: "desc" },
  });

  const decision = decidingEvent(events, window.start, window.end);
  const note = decision
    ? decidingEventNote(decision.event.eventType, decision.at, window.end)
    : null;

  return {
    ok: true,
    canDelete: viewer.group.ownerId === user.id,
    countedAtLabel: decision
      ? formatTimeInZone(decision.at, window.timezone)
      : null,
    events: events.map((event) => ({
      id: event.id,
      label: SLEEP_EVENT_LABELS[event.eventType] ?? event.eventType,
      timeLabel: formatEventStamp(event.eventTime, window.timezone),
      decides: decision?.event.id === event.id,
      note: decision?.event.id === event.id ? note : null,
    })),
  };
}

export type DeleteSleepEventResult = { ok: true } | { ok: false; error: string };

export async function deleteSleepEvent(
  groupId: string,
  eventId: string,
  nightRaw: string,
): Promise<DeleteSleepEventResult> {
  const user = await requireOnboardedUser();
  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return { ok: false, error: "You can’t edit this group." };

  const night = parseDateOnly(nightRaw);
  if (!eventId || !night) return { ok: false, error: "That event wasn’t found." };

  const event = await prisma.sleepEvent.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: "That event wasn’t found." };

  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: event.userId } },
  });
  if (!member) return { ok: false, error: "That event isn’t in this group." };
  if (await hasPendingInvite(groupId, event.userId)) {
    return { ok: false, error: "They haven’t joined this group yet." };
  }

  await prisma.sleepEvent.delete({ where: { id: eventId } });
  await recomputeGroupSleepNight(
    groupId,
    night,
    formatDateOnly(night),
    event.userId,
  );
  revalidateGroup(groupId);
  return { ok: true };
}

export type DeleteSleepEventsResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

export async function deleteSleepEvents(
  groupId: string,
  eventIds: string[],
  nightRaw: string,
): Promise<DeleteSleepEventsResult> {
  const user = await requireOnboardedUser();
  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return { ok: false, error: "You can’t edit this group." };

  const night = parseDateOnly(nightRaw);
  const ids = [
    ...new Set(
      (Array.isArray(eventIds) ? eventIds : []).filter(
        (id) => typeof id === "string" && id.length > 0,
      ),
    ),
  ];
  if (!night || ids.length === 0) {
    return { ok: false, error: "Select at least one event." };
  }
  if (ids.length > 5000) {
    return { ok: false, error: "Select 5,000 events or fewer at a time." };
  }

  const events = await prisma.sleepEvent.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true },
  });
  if (events.length !== ids.length) {
    return { ok: false, error: "Some of those events weren’t found." };
  }

  const userIds = [...new Set(events.map((event) => event.userId))];
  const members = await prisma.groupMember.findMany({
    where: { groupId, userId: { in: userIds } },
    select: { userId: true },
  });
  if (members.length !== userIds.length) {
    return { ok: false, error: "Some of those events aren’t in this group." };
  }
  const pending = await prisma.groupInvite.findMany({
    where: { groupId, status: "PENDING", recipientId: { in: userIds } },
    select: { recipientId: true },
  });
  if (pending.length > 0) {
    return { ok: false, error: "They haven’t joined this group yet." };
  }

  const result = await prisma.sleepEvent.deleteMany({
    where: { id: { in: ids } },
  });
  const nightKey = formatDateOnly(night);
  for (const userId of userIds) {
    await recomputeGroupSleepNight(groupId, night, nightKey, userId);
  }
  revalidateGroup(groupId);
  return { ok: true, deleted: result.count };
}
