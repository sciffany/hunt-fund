import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TIMEZONE,
  defaultSleepTimes,
  parseDateOnly,
  sleepTimesToJson,
} from "@/lib/sleep";

export const DEV_USERS = {
  owner: {
    email: "dev-owner@localhost",
    username: "devowner",
    name: "Dev Owner",
    displayName: "Dev Owner",
  },
  member: {
    email: "dev-member@localhost",
    username: "devmember",
    name: "Dev Member",
    displayName: "Dev Member",
  },
} as const;

export type DevLoginWho = keyof typeof DEV_USERS;

const DEV_GROUP_NAME = "Dev Sleep Club";
const DEV_SCHEDULE_FROM = parseDateOnly("2026-01-01")!;

export function isDevLoginEnabled() {
  return process.env.NODE_ENV === "development";
}

export function parseDevLoginWho(value: unknown): DevLoginWho | null {
  if (value === "owner" || value === "member") return value;
  return null;
}

export async function ensureDevUser(who: DevLoginWho) {
  if (!isDevLoginEnabled()) {
    throw new Error("Dev login is disabled.");
  }

  const owner = await prisma.user.upsert({
    where: { email: DEV_USERS.owner.email },
    create: DEV_USERS.owner,
    update: {
      username: DEV_USERS.owner.username,
      name: DEV_USERS.owner.name,
      displayName: DEV_USERS.owner.displayName,
    },
  });

  const member = await prisma.user.upsert({
    where: { email: DEV_USERS.member.email },
    create: DEV_USERS.member,
    update: {
      username: DEV_USERS.member.username,
      name: DEV_USERS.member.name,
      displayName: DEV_USERS.member.displayName,
    },
  });

  await ensureDevGroup(owner.id, member.id);

  return who === "owner" ? owner : member;
}

async function ensureDevGroup(ownerId: string, memberId: string) {
  let group = await prisma.group.findFirst({
    where: { ownerId, name: DEV_GROUP_NAME },
  });

  if (!group) {
    group = await prisma.group.create({
      data: {
        name: DEV_GROUP_NAME,
        ownerId,
        trackingKinds: ["SLEEP_TIME_GADGET_USAGE"],
      },
    });
  }

  const [ownerMember, memberMember] = await Promise.all([
    prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: ownerId } },
      create: { groupId: group.id, userId: ownerId, role: "OWNER" },
      update: { role: "OWNER" },
    }),
    prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: memberId } },
      create: { groupId: group.id, userId: memberId, role: "MEMBER" },
      update: {},
    }),
  ]);

  const times = sleepTimesToJson(defaultSleepTimes());
  await Promise.all([
    prisma.sleepSchedule.upsert({
      where: {
        groupMemberId_effectiveFrom: {
          groupMemberId: ownerMember.id,
          effectiveFrom: DEV_SCHEDULE_FROM,
        },
      },
      create: {
        groupMemberId: ownerMember.id,
        effectiveFrom: DEV_SCHEDULE_FROM,
        timezone: DEFAULT_TIMEZONE,
        times,
      },
      update: {},
    }),
    prisma.sleepSchedule.upsert({
      where: {
        groupMemberId_effectiveFrom: {
          groupMemberId: memberMember.id,
          effectiveFrom: DEV_SCHEDULE_FROM,
        },
      },
      create: {
        groupMemberId: memberMember.id,
        effectiveFrom: DEV_SCHEDULE_FROM,
        timezone: DEFAULT_TIMEZONE,
        times,
      },
      update: {},
    }),
  ]);
}
