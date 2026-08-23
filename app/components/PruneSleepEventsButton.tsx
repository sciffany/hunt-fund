"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { pruneOldSleepEvents } from "@/lib/actions/sleep";
import { EVENT_RETENTION_DAYS } from "@/lib/sleep";

const CONFIRM_WINDOW_MS = 4000;

type Status =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "done"; deleted: number }
  | { kind: "error"; message: string };

export function PruneSleepEventsButton({ groupId }: { groupId: string }) {
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
      setStatus((current) => (current.kind === "confirm" ? { kind: "idle" } : current));
      armTimeout.current = null;
    }, CONFIRM_WINDOW_MS);
  };

  const run = () => {
    disarm();
    startTransition(async () => {
      const result = await pruneOldSleepEvents(groupId);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      setStatus({ kind: "done", deleted: result.deleted });
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
  let extraClass = "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50";
  if (isPending) {
    label = "Pruning…";
  } else if (status.kind === "confirm") {
    label = "Click again to confirm";
    extraClass = "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100";
  } else if (status.kind === "done") {
    label = `Deleted ${status.deleted.toLocaleString("en-SG")} event${
      status.deleted === 1 ? "" : "s"
    }`;
    extraClass = "border-green-200 bg-green-50 text-green-800 hover:bg-green-50";
  } else if (status.kind === "error") {
    label = "Prune failed";
    extraClass = "border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
  } else {
    label = `Prune events older than ${EVENT_RETENTION_DAYS} days`;
  }

  const title =
    status.kind === "error"
      ? status.message
      : `Delete sleep events older than ${EVENT_RETENTION_DAYS} days. Cached nights are kept.`;

  return (
    <button
      type="button"
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${extraClass}`}
      title={title}
      disabled={isPending}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
