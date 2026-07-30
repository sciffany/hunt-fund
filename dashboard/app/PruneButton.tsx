"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { pruneOldEvents } from "@/lib/actions";
import { RETENTION_DAYS } from "@/lib/data";

const CONFIRM_WINDOW_MS = 4000;

type Status =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "done"; deleted: number }
  | { kind: "error"; message: string };

/**
 * Global "Prune old events" control shown in the dashboard header.
 *
 * Two-click confirm: first click arms the button ("Click again to confirm")
 * for CONFIRM_WINDOW_MS; the second click within that window actually
 * deletes sleep_events older than RETENTION_DAYS.
 */
export default function PruneButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const armTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (armTimeout.current) clearTimeout(armTimeout.current);
    };
  }, []);

  const disarm = () => {
    if (armTimeout.current) {
      clearTimeout(armTimeout.current);
      armTimeout.current = null;
    }
  };

  const arm = () => {
    disarm();
    setStatus({ kind: "confirm" });
    armTimeout.current = setTimeout(() => {
      setStatus((s) => (s.kind === "confirm" ? { kind: "idle" } : s));
      armTimeout.current = null;
    }, CONFIRM_WINDOW_MS);
  };

  const run = () => {
    disarm();
    startTransition(async () => {
      const res = await pruneOldEvents();
      if (!res.ok) {
        setStatus({ kind: "error", message: res.error });
        return;
      }
      setStatus({ kind: "done", deleted: res.deleted });
      router.refresh();
    });
  };

  const onClick = () => {
    if (isPending) return;
    if (status.kind === "confirm") {
      run();
    } else {
      arm();
    }
  };

  let label: string;
  let extraClass = "";
  if (isPending) {
    label = "Pruning\u2026";
  } else if (status.kind === "confirm") {
    label = "Click again to confirm";
    extraClass = " prune-armed";
  } else if (status.kind === "done") {
    label = `Deleted ${status.deleted.toLocaleString("en-SG")} event${status.deleted === 1 ? "" : "s"}`;
    extraClass = " prune-done";
  } else if (status.kind === "error") {
    label = "Prune failed";
    extraClass = " prune-error";
  } else {
    label = `Prune events older than ${RETENTION_DAYS} days`;
  }

  const title =
    status.kind === "error"
      ? status.message
      : `Delete sleep_events older than ${RETENTION_DAYS} days. sleep_nights rows are kept.`;

  return (
    <button
      type="button"
      className={`prune${extraClass}`}
      title={title}
      disabled={isPending}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
