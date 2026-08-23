"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/actions/profile";
import {
  parsePenaltyAmount,
  parsePenaltyUnit,
  parsePenaltyUnitLabel,
} from "@/lib/penalty";
import { parseDateOnly } from "@/lib/sleep";
import { parseTargetSteps } from "@/lib/steps";
import { requireOnboardedUser } from "@/lib/session";

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

export async function saveStepTarget(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const groupMemberId = String(formData.get("groupMemberId") ?? "");
  const targetId = String(formData.get("targetId") ?? "").trim();
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

  const targetSteps = parseTargetSteps(formData.get("targetSteps"));
  if (targetSteps === null) {
    return { error: "Enter a whole number of steps between 1 and 1,000,000." };
  }

  const data = { effectiveFrom, targetSteps };

  try {
    if (targetId) {
      const existing = await prisma.stepTarget.findUnique({
        where: { id: targetId },
      });
      if (!existing || existing.groupMemberId !== groupMemberId) {
        return { error: "That target wasn’t found." };
      }
      await prisma.stepTarget.update({
        where: { id: targetId },
        data,
      });
    } else {
      await prisma.stepTarget.create({
        data: { groupMemberId, ...data },
      });
    }
  } catch (error) {
    if (uniqueConstraintError(error)) {
      return { error: "This member already has a target starting on that date." };
    }
    throw error;
  }

  revalidateGroup(groupId);
  return { success: targetId ? "Target saved." : "Target added." };
}

export async function deleteStepTarget(formData: FormData) {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const targetId = String(formData.get("targetId") ?? "");

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return;

  const existing = await prisma.stepTarget.findUnique({
    where: { id: targetId },
    include: { groupMember: { select: { groupId: true } } },
  });
  if (!existing || existing.groupMember.groupId !== groupId) return;

  await prisma.stepTarget.delete({ where: { id: targetId } });
  revalidateGroup(groupId);
}

export async function saveStepPenalty(
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
      const existing = await prisma.stepPenalty.findUnique({
        where: { id: penaltyId },
      });
      if (!existing || existing.groupMemberId !== groupMemberId) {
        return { error: "That penalty wasn’t found." };
      }
      await prisma.stepPenalty.update({
        where: { id: penaltyId },
        data,
      });
    } else {
      await prisma.stepPenalty.create({
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

export async function deleteStepPenalty(formData: FormData) {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const penaltyId = String(formData.get("penaltyId") ?? "");

  const group = await requireOwnedGroup(user.id, groupId);
  if (!group) return;

  const existing = await prisma.stepPenalty.findUnique({
    where: { id: penaltyId },
    include: { groupMember: { select: { groupId: true } } },
  });
  if (!existing || existing.groupMember.groupId !== groupId) return;

  await prisma.stepPenalty.delete({ where: { id: penaltyId } });
  revalidateGroup(groupId);
}
