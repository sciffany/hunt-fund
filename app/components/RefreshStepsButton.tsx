"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importSheetSteps } from "@/lib/actions/import-steps";

type Status =
  | { kind: "idle" }
  | { kind: "done"; updated: number }
  | { kind: "error"; message: string };

export function RefreshStepsButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const run = () => {
    startTransition(async () => {
      const result = await importSheetSteps(groupId);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        router.refresh();
        return;
      }
      setStatus({ kind: "done", updated: result.updated });
      router.refresh();
    });
  };

  let label: string;
  let extraClass = "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50";
  if (isPending) {
    label = "Refreshing…";
  } else if (status.kind === "done") {
    label =
      status.updated === 0
        ? "No steps in the last month"
        : `Updated ${status.updated.toLocaleString("en-SG")} day${
            status.updated === 1 ? "" : "s"
          }`;
    extraClass = "border-green-200 bg-green-50 text-green-800 hover:bg-green-50";
  } else if (status.kind === "error") {
    label = "Refresh failed";
    extraClass = "border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
  } else {
    label = "Refresh steps";
  }

  const title =
    status.kind === "error"
      ? status.message
      : "Pull the last month of steps from Google Sheets.";

  return (
    <button
      type="button"
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${extraClass}`}
      title={title}
      disabled={isPending}
      onClick={() => {
        if (isPending) return;
        run();
      }}
    >
      {label}
    </button>
  );
}
