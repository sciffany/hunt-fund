import { prisma } from "@/lib/prisma";

/** Pending invitees get a membership so their settings can be edited before they sign in. */
export async function ensurePendingMemberships(groupId: string) {
  const pending = await prisma.groupInvite.findMany({
    where: { groupId, status: "PENDING" },
    select: { recipientId: true },
  });
  if (pending.length === 0) return;

  await prisma.groupMember.createMany({
    data: pending.map((invite) => ({
      groupId,
      userId: invite.recipientId,
      role: "MEMBER" as const,
    })),
    skipDuplicates: true,
  });
}

/**
 * Label for someone who has not accepted. Uses their public username when
 * they have one, otherwise the email the owner invited. Never their real name.
 */
export function pendingMemberLabel(user: {
  username: string | null;
  email?: string | null;
}): string {
  if (user.username) return `@${user.username}`;
  return user.email ?? "Invited";
}

export async function hasPendingInvite(groupId: string, userId: string) {
  const invite = await prisma.groupInvite.findUnique({
    where: { groupId_recipientId: { groupId, recipientId: userId } },
    select: { status: true },
  });
  return invite?.status === "PENDING";
}
