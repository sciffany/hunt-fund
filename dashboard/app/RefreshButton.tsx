"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshNight } from "@/lib/actions";

type Props = {
  night: string;
  refreshedAt: string | null;
  /**
   * When false, the raw events for this night have been pruned and the
   * cached value in sleep_nights is frozen. Renders a disabled button
   * with an explanatory tooltip.
   */
  refreshable: boolean;
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

export default function RefreshButton({
  night,
  refreshedAt,
  refreshable,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const frozenTitle = `Raw events for ${night} have been pruned; historical value is frozen.`;
  const baseTitle = refreshedAt
    ? `Last refreshed ${formatSgtHm(refreshedAt)} SGT · click to recompute`
    : `Recompute latest activity for ${night}`;
  const title = !refreshable ? frozenTitle : (error ?? baseTitle);

  return (
    <button
      type="button"
      className={`refresh${error ? " refresh-error" : ""}${!refreshable ? " refresh-frozen" : ""}`}
      title={title}
      aria-label={`Refresh ${night}`}
      disabled={isPending || !refreshable}
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
