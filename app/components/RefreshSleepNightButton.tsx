"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshSleepNight } from "@/lib/actions/sleep";

export function RefreshSleepNightButton({
  groupId,
  night,
}: {
  groupId: string;
  night: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const title = error
    ? error
    : `Recompute latest activity from 8:00 PM–6:00 AM for ${night}`;

  return (
    <button
      type="button"
      title={title}
      aria-label={`Refresh latest sleep time for ${night}`}
      disabled={isPending}
      className={`rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 disabled:opacity-60 ${
        error ? "text-red-600 hover:text-red-700" : ""
      }`}
      onClick={() => {
        startTransition(async () => {
          setError(null);
          const result = await refreshSleepNight(groupId, night);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <span
        aria-hidden
        className={`inline-block text-sm leading-none ${
          isPending ? "animate-spin" : ""
        }`}
      >
        ↻
      </span>
    </button>
  );
}
