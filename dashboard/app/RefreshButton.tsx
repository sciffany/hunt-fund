"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshNight } from "@/lib/actions";

type Props = {
  night: string;
  refreshedAt: string | null;
};

/** Format a UTC ISO string as "HH:MM" in SGT. */
function formatSgtHm(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export default function RefreshButton({ night, refreshedAt }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const baseTitle = refreshedAt
    ? `Last refreshed ${formatSgtHm(refreshedAt)} SGT · click to recompute`
    : `Recompute latest activity for ${night}`;

  return (
    <button
      type="button"
      className={`refresh${error ? " refresh-error" : ""}`}
      title={error ?? baseTitle}
      aria-label={`Refresh ${night}`}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          setError(null);
          const res = await refreshNight(night);
          if (!res.ok) {
            setError(res.error);
          } else {
            router.refresh();
          }
        });
      }}
    >
      <span className={isPending ? "refresh-icon spinning" : "refresh-icon"}>
        ↻
      </span>
    </button>
  );
}
