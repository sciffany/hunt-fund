"use client";

import { useActionState } from "react";
import { createGroup, inviteToGroup } from "@/lib/actions/groups";
import {
  completeOnboarding,
  updateDisplayName,
  type ActionState,
} from "@/lib/actions/profile";

const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500";

const primaryButtonClass =
  "rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60";

function FieldMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return <p className="text-sm text-red-700">{state.error}</p>;
  }
  if (state.success) {
    return <p className="text-sm text-green-700">{state.success}</p>;
  }
  return null;
}

export function OnboardingForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const [state, action, pending] = useActionState(completeOnboarding, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        Username
        <input
          name="username"
          required
          autoComplete="username"
          autoFocus
          placeholder="yourname"
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-neutral-500">
          3–20 characters, starting with a letter. This can’t be changed later.
        </span>
      </label>
      <label className="block text-sm">
        Display name
        <input
          name="displayName"
          required
          defaultValue={defaultDisplayName}
          autoComplete="nickname"
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-neutral-500">
          Shown to other people in your groups.
        </span>
      </label>
      <FieldMessage state={state} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

export function DisplayNameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        Display name
        <input
          name="displayName"
          required
          defaultValue={current}
          autoComplete="nickname"
          className={inputClass}
        />
      </label>
      <FieldMessage state={state} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function CreateGroupForm() {
  const [state, action, pending] = useActionState(createGroup, {});

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        Group name
        <input
          name="name"
          required
          autoFocus
          placeholder="House fund"
          className={inputClass}
        />
      </label>
      <FieldMessage state={state} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}

export function InviteForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(inviteToGroup, {});

  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="groupId" value={groupId} />
      <label className="block min-w-0 flex-1 text-sm sm:min-w-80">
        Username or email
        <input
          name="identifier"
          required
          placeholder="@username or name@email.com"
          size={40}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={`${primaryButtonClass} sm:mb-px`}>
        {pending ? "Sending…" : "Send invite"}
      </button>
      <div className="sm:basis-full">
        <FieldMessage state={state} />
      </div>
    </form>
  );
}
