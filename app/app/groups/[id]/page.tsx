import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupMonthDashboard } from "@/components/GroupMonthDashboard";
import { leaveGroup } from "@/lib/actions/groups";
import {
  currentYearMonth,
  parseYearMonth,
} from "@/lib/month";
import { prisma } from "@/lib/prisma";
import { displayNameOf, requireOnboardedUser } from "@/lib/session";
import { DEFAULT_TIMEZONE, todayInTimeZone } from "@/lib/sleep";

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

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: {
            select: {
              displayName: true,
              name: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!group) notFound();

  const month = parseYearMonth(monthParam) ?? currentYearMonth(DEFAULT_TIMEZONE);

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
        members={group.members.map((member) => ({
          id: member.id,
          displayName: displayNameOf(member.user),
        }))}
      />
    </AppShell>
  );
}
