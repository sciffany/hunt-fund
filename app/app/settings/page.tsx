import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { DisplayNameForm } from "@/components/forms";
import { SignOutButton } from "@/components/SignOutButton";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireOnboardedUser();

  return (
    <AppShell>
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <section className="mt-8 max-w-md">
        <h2 className="text-sm font-medium text-neutral-500">Username</h2>
        <p className="mt-2 text-sm">@{user.username}</p>
        <p className="mt-1 text-xs text-neutral-500">This can’t be changed.</p>
      </section>

      <section className="mt-8 max-w-md">
        <h2 className="text-sm font-medium text-neutral-500">Display name</h2>
        <p className="mt-1 text-xs text-neutral-500">
          This is how you appear to other people.
        </p>
        <div className="mt-3">
          <DisplayNameForm current={user.displayName ?? ""} />
        </div>
      </section>

      {user.email && (
        <section className="mt-8 max-w-md">
          <h2 className="text-sm font-medium text-neutral-500">Google account</h2>
          <p className="mt-2 text-sm">{user.email}</p>
        </section>
      )}

      <section className="mt-10">
        <SignOutButton />
      </section>
    </AppShell>
  );
}
