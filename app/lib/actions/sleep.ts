"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/actions/profile";
import { requireOnboardedUser } from "@/lib/session";
import {
  parsePenaltyAmount,
  parsePenaltyUnit,
  parsePenaltyUnitLabel,
} from "@/lib/penalty";
import {
  parseDateOnly,
  parseHalfHoursPast8pm,
  parseSleepTimes,
  sleepTimesToJson,
  WEEKDAYS,
  isValidTimeZone,
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

  const enabled = formData.get("sleepTracking") === "on";
  await prisma.group.update({
    where: { id: groupId },
    data: {
      trackingKinds: enabled ? ["SLEEP_TIME_GADGET_USAGE"] : [],
    },
  });

  revalidateGroup(groupId);
  return {
    success: enabled
      ? "Sleep tracking is on. Customize bedtimes below."
      : "Sleep tracking is off.",
  };
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
