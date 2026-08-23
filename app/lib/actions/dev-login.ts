"use server";

import { signIn } from "@/auth";
import { isDevLoginEnabled, parseDevLoginWho } from "@/lib/dev-login";

export async function signInAsDev(formData: FormData) {
  if (!isDevLoginEnabled()) return;
  const who = parseDevLoginWho(formData.get("who"));
  if (!who) return;
  const redirectTo = String(formData.get("redirectTo") || "/home");
  await signIn("dev", { who, redirectTo });
}
