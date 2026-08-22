import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CreateGroupForm } from "@/components/forms";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "New group",
};

export default async function NewGroupPage() {
  const user = await requireOnboardedUser();

  return (
    <AppShell>
      <p className="text-sm text-neutral-500">
        <Link href="/home" className="hover:text-neutral-900">
          Home
        </Link>
        <span className="mx-1">/</span>
        New group
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">Create a group</h1>
      <p className="mt-2 text-sm text-neutral-600">
        You’ll be the owner. After you create it, you can invite people by
        username or email.
      </p>
      <div className="mt-6 max-w-md">
        <CreateGroupForm />
      </div>
    </AppShell>
  );
}
