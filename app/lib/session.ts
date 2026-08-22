import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOnboardedUser() {
  const user = await requireUser();
  if (!user.username) redirect("/onboarding");
  return user as typeof user & { username: string };
}

export function displayNameOf(user: {
  displayName: string | null;
  name: string | null;
  username: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.username || user.email || "Member";
}
