"use client";

import { useActionState, useRef, useState } from "react";
import { ConfirmForm } from "@/components/ConfirmForm";
import {
  DashboardMetricCell,
  DashboardMonthTable,
  DashboardSection,
} from "@/components/dashboard";
import type { ActionState } from "@/lib/actions/profile";
import {
  deleteWorkArrivalCheckIn,
  recordWorkArrivalCheckIn,
} from "@/lib/actions/work-arrival";
import { formatLatitude, formatLongitude } from "@/lib/work-arrival";
import { type YearMonth } from "@/lib/month";

export type WorkArrivalDashboardCell = {
  time: string | null;
  miss: boolean;
  late: boolean;
  penaltyLabel: string | null;
};

export type WorkArrivalDashboardMember = {
  id: string;
  displayName: string;
  cells: Record<string, WorkArrivalDashboardCell>;
  totalPenalty: string;
};

function FieldMessage({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p className="text-sm text-green-700">{state.success}</p>;
  return null;
}

function CheckInForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(recordWorkArrivalCheckIn, {});
  const [locating, setLocating] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);

  function checkIn() {
    if (!navigator.geolocation) {
      setClientError("This browser can’t share your location.");
      return;
    }
    setLocating(true);
    setClientError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = formatLatitude(position.coords.latitude);
        const longitude = formatLongitude(position.coords.longitude);
        if (
          !latitude ||
          !longitude ||
          !latitudeRef.current ||
          !longitudeRef.current
        ) {
          setLocating(false);
          setClientError("This location can’t be used.");
          return;
        }
        latitudeRef.current.value = latitude;
        longitudeRef.current.value = longitude;
        setLocating(false);
        formRef.current?.requestSubmit();
      },
      () => {
        setLocating(false);
        setClientError("Allow location access to check in.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-3 py-3 sm:px-4"
    >
      <input type="hidden" name="groupId" value={groupId} />
      <input ref={latitudeRef} type="hidden" name="latitude" />
      <input ref={longitudeRef} type="hidden" name="longitude" />
      <button
        type="button"
        onClick={checkIn}
        disabled={pending || locating}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : locating ? "Finding location…" : "Check in"}
      </button>
      <p className="text-xs text-neutral-500">
        Records the server time and this device’s location.
      </p>
      {clientError ? (
        <p className="text-sm text-red-700">{clientError}</p>
      ) : (
        <FieldMessage state={state} />
      )}
    </form>
  );
}

export function GroupMonthWorkArrivalDashboard({
  groupId,
  month,
  members,
  today,
  dateNotes,
}: {
  groupId: string;
  month: YearMonth;
  members: WorkArrivalDashboardMember[];
  today: string;
  dateNotes?: Record<string, string[]>;
}) {
  const memberById = new Map(members.map((member) => [member.id, member]));

  return (
    <DashboardSection
      title="Work arrival"
      description="One check-in per work day. The server records the time. Highlighted cells are late or outside the place."
      actions={
        <ConfirmForm
          action={deleteWorkArrivalCheckIn}
          hidden={{ groupId }}
          confirmMessage="Delete your check-in for today?"
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          Remove today’s check-in
        </ConfirmForm>
      }
    >
      <CheckInForm groupId={groupId} />
      <DashboardMonthTable
        month={month}
        members={members}
        today={today}
        footerValues={members.map((member) => member.totalPenalty)}
        dateNotes={dateNotes}
        renderCell={(memberId, date) => {
          const cell = memberById.get(memberId)?.cells[date];
          const flagged = Boolean(cell?.miss || cell?.late);
          const value = cell?.time ?? (cell?.miss ? "Miss" : null);
          return (
            <DashboardMetricCell
              value={value}
              flagged={flagged}
              penaltyLabel={cell?.penaltyLabel ?? null}
            />
          );
        }}
      />
    </DashboardSection>
  );
}
