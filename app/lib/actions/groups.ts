"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/session";
import { normalizeUsername, validateGroupName } from "@/lib/username";
import type { ActionState } from "@/lib/actions/profile";

async function requireMembership(userId: string, groupId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    return null;
  }
  return membership;
}

export async function createGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const name = String(formData.get("name") ?? "").trim();

  const nameError = validateGroupName(name);
  if (nameError) return { error: nameError };

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: { name, ownerId: user.id },
    });
    await tx.groupMember.create({
      data: { groupId: created.id, userId: user.id, role: "OWNER" },
    });
    return created;
  });

  redirect(`/groups/${group.id}`);
}

function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findOrCreateRecipient(identifier: string) {
  if (identifier.includes("@")) {
    const email = normalizeEmail(identifier);
    if (!isEmail(email)) {
      return { error: "Enter a valid email address." } as const;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { user: existing } as const;

    try {
      const created = await prisma.user.create({ data: { email } });
      return { user: created } as const;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await prisma.user.findUnique({ where: { email } });
        if (raced) return { user: raced } as const;
      }
      throw error;
    }
  }

  const username = normalizeUsername(identifier);
  if (!username) return { error: "Enter a username or email." } as const;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) return { error: "We couldn’t find that username." } as const;
  return { user: existing } as const;
}

export async function inviteToGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");
  const identifier = String(formData.get("identifier") ?? "").trim();

  if (!groupId) return { error: "Group not found." };
  if (!identifier) return { error: "Enter a username or email." };

  const membership = await requireMembership(user.id, groupId);
  if (!membership) return { error: "You are not a member of this group." };

  const resolved = await findOrCreateRecipient(identifier);
  if ("error" in resolved) return { error: resolved.error };

  const recipient = resolved.user;
  if (recipient.id === user.id) return { error: "You can’t invite yourself." };

  const alreadyMember = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: recipient.id } },
  });
  if (alreadyMember) return { error: "That person is already in the group." };

  const existing = await prisma.groupInvite.findUnique({
    where: { groupId_recipientId: { groupId, recipientId: recipient.id } },
  });

  if (existing?.status === "PENDING") {
    return { error: "They already have a pending invite." };
  }

  const payload = {
    senderId: user.id,
    status: "PENDING" as const,
    createdAt: new Date(),
    respondedAt: null,
  };

  try {
    if (existing) {
      await prisma.groupInvite.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await prisma.groupInvite.create({
        data: { groupId, recipientId: recipient.id, ...payload },
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "They already have a pending invite." };
    }
    throw error;
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/home");
  const label = recipient.username
    ? `@${recipient.username}`
    : recipient.email ?? identifier;
  return { success: `Invite sent to ${label}.` };
}

export async function acceptInvite(formData: FormData) {
  const user = await requireOnboardedUser();
  const inviteId = String(formData.get("inviteId") ?? "");

  const invite = await prisma.groupInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite || invite.recipientId !== user.id || invite.status !== "PENDING") {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.groupMember.upsert({
      where: { groupId_userId: { groupId: invite.groupId, userId: user.id } },
      create: { groupId: invite.groupId, userId: user.id, role: "MEMBER" },
      update: {},
    });
    await tx.groupInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
  });

  revalidatePath("/home");
  revalidatePath(`/groups/${invite.groupId}`);
  redirect(`/groups/${invite.groupId}`);
}

export async function declineInvite(formData: FormData) {
  const user = await requireOnboardedUser();
  const inviteId = String(formData.get("inviteId") ?? "");

  const invite = await prisma.groupInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite || invite.recipientId !== user.id || invite.status !== "PENDING") {
    return;
  }

  await prisma.groupInvite.update({
    where: { id: invite.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });

  revalidatePath("/home");
  revalidatePath(`/groups/${invite.groupId}`);
}

export async function leaveGroup(formData: FormData) {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");

  const membership = await requireMembership(user.id, groupId);
  if (!membership) return;
  if (membership.role === "OWNER") return;

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId, userId: user.id } },
  });

  revalidatePath("/home");
  revalidatePath(`/groups/${groupId}`);
  redirect("/home");
}

export async function deleteGroup(formData: FormData) {
  const user = await requireOnboardedUser();
  const groupId = String(formData.get("groupId") ?? "");

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.ownerId !== user.id) return;

  await prisma.group.delete({ where: { id: groupId } });

  revalidatePath("/home");
  redirect("/home");
}
