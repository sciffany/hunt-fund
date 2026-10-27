"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOnboardedUser, requireUser } from "@/lib/session";
import {
  normalizeUsername,
  validateDisplayName,
  validateUsername,
} from "@/lib/username";

export type ActionState = {
  error?: string;
  success?: string;
  /** Saved check-in that is not at the place. */
  warning?: string;
  /** True when this check-in is at the place and worth a celebration. */
  celebrate?: boolean;
};

export async function completeOnboarding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (user.username) {
    redirect("/home");
  }

  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const displayName = String(formData.get("displayName") ?? "").trim();

  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };

  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) return { error: displayNameError };

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { username, displayName },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "That username is already taken." };
    }
    throw error;
  }

  redirect("/home");
}

export async function updateDisplayName(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOnboardedUser();
  const displayName = String(formData.get("displayName") ?? "").trim();

  const displayNameError = validateDisplayName(displayName);
  if (displayNameError) return { error: displayNameError };

  await prisma.user.update({
    where: { id: user.id },
    data: { displayName },
  });

  return { success: "Display name saved." };
}
