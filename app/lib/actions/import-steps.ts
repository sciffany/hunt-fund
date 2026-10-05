"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOnboardedUser } from "@/lib/session";
import { parseDateOnly } from "@/lib/sleep";
import { STEP_SHEET_SOURCES, fetchSheetStepDays } from "@/lib/step-sheets";

export type ImportStepsResult =
  | { ok: true; updated: number; people: number }
  | { ok: false; error: string };

export async function importSheetSteps(groupId: string): Promise<ImportStepsResult> {
  const user = await requireOnboardedUser();
  if (!groupId) return { ok: false, error: "Pick a group." };

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
    include: { group: { select: { trackingKinds: true } } },
  });
  if (!membership) return { ok: false, error: "You aren’t in this group." };
  if (!membership.group.trackingKinds.includes("DAILY_STEPS")) {
    return { ok: false, error: "Step tracking is off for this group." };
  }

  if (STEP_SHEET_SOURCES.length === 0) {
    return { ok: false, error: "No Google Sheet step imports are configured." };
  }

  const errors: string[] = [];
  let updated = 0;
  let people = 0;

  for (const source of STEP_SHEET_SOURCES) {
    try {
      const account = await prisma.user.findFirst({
        where: { email: { equals: source.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (!account) {
        errors.push(`No account for ${source.email}.`);
        continue;
      }

      const sheet = await fetchSheetStepDays(source);
      if (!sheet.ok) {
        errors.push(sheet.error);
        continue;
      }

      const rows = sheet.days.flatMap((day) => {
        const night = parseDateOnly(day.date);
        return night ? [{ night, steps: day.steps }] : [];
      });

      if (rows.length > 0) {
        await prisma.$transaction(
          rows.map((row) =>
            prisma.stepNight.upsert({
              where: { userId_night: { userId: account.id, night: row.night } },
              create: { userId: account.id, night: row.night, steps: row.steps },
              update: { steps: row.steps },
            }),
          ),
        );
      }

      updated += rows.length;
      people += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Couldn’t save steps for ${source.email}: ${message}`);
    }
  }

  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/settings`);

  if (errors.length > 0) {
    return { ok: false, error: errors.join(" ") };
  }
  return { ok: true, updated, people };
}
