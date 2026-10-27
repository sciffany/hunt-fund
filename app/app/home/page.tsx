import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { acceptInvite, declineInvite } from "@/lib/actions/groups";
import { prisma } from "@/lib/prisma";
import { displayNameOf, requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  const user = await requireOnboardedUser();

  const [memberships, invites] = await Promise.all([
    prisma.groupMember.findMany({
      where: { userId: user.id },
      include: {
        group: { include: { _count: { select: { members: true } } } },
      },
      orderBy: { joinedAt: "desc" },
    }),
    prisma.groupInvite.findMany({
      where: { recipientId: user.id, status: "PENDING" },
      include: {
        group: true,
        sender: { select: { username: true, displayName: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const pendingGroupIds = new Set(invites.map((invite) => invite.groupId));
  const joined = memberships.filter((membership) => !pendingGroupIds.has(membership.group.id));

  return (
    <AppShell>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Home</h1>
        <Link
          href="/groups/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New group
        </Link>
      </div>

      {invites.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-neutral-500">Pending invites</h2>
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{invite.group.name}</p>
                  <p className="text-xs text-neutral-500">
                    Invited by {displayNameOf(invite.sender)}
                    {invite.sender.username ? ` (@${invite.sender.username})` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={acceptInvite}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
                    >
                      Accept
                    </button>
                  </form>
                  <form action={declineInvite}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
                    >
                      Decline
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-neutral-500">Your groups</h2>
        {joined.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            You’re not in any groups yet. Create one, or wait for an invite.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
            {joined.map(({ group, role }) => (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
                >
                  <span className="text-sm font-medium">{group.name}</span>
                  <span className="text-xs text-neutral-500">
                    {group._count.members}{" "}
                    {group._count.members === 1 ? "member" : "members"}
                    {role === "OWNER" ? " · Owner" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
