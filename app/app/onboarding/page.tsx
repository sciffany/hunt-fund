import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/forms";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Set up your profile",
};

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.username) {
    redirect("/home");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your profile</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Pick a username. You can’t change it later.
      </p>
      <div className="mt-8">
        <OnboardingForm defaultDisplayName={user.displayName ?? user.name ?? ""} />
      </div>
    </main>
  );
}
