"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const CONFETTI_COLORS = ["#f59e0b", "#10b981", "#38bdf8", "#f43f5e", "#a78bfa", "#facc15"];

function confettiPieces(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    left: (index * 37) % 100,
    delay: (index % 8) * 0.05,
    duration: 1.45 + (index % 5) * 0.16,
    drift: (index % 2 === 0 ? 1 : -1) * (24 + (index % 7) * 14),
    spin: (index % 2 === 0 ? 1 : -1) * (200 + (index % 5) * 80),
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    size: 7 + (index % 4) * 3,
    round: index % 3 === 0,
  }));
}

function CheckInCelebration({ burst }: { burst: number }) {
  const [visible, setVisible] = useState(false);
  const pieces = useRef(confettiPieces(42)).current;

  useEffect(() => {
    if (!burst) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 2200);
    return () => window.clearTimeout(timer);
  }, [burst]);

  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-live="polite"
    >
      <style>{`
        @keyframes checkin-confetti-fall {
          0% { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 108vh, 0) rotate(var(--spin)); opacity: 0; }
        }
        @keyframes checkin-congrats {
          0% { transform: translateY(8px) scale(0.86); opacity: 0; }
          18% { transform: translateY(0) scale(1.06); opacity: 1; }
          72% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-6px) scale(1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .checkin-confetti-piece { display: none; }
          .checkin-congrats { animation: none; opacity: 1; }
        }
      `}</style>
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="checkin-confetti-piece absolute top-0 block"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 1.6,
            background: piece.color,
            borderRadius: piece.round ? 999 : 2,
            animation: `checkin-confetti-fall ${piece.duration}s ${piece.delay}s ease-in both`,
            ["--drift" as string]: `${piece.drift}px`,
            ["--spin" as string]: `${piece.spin}deg`,
          }}
        />
      ))}
      <p
        className="checkin-congrats absolute top-[22%] left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2 text-lg font-semibold tracking-tight text-white shadow-lg"
        style={{ animation: "checkin-congrats 2s ease both" }}
      >
        Nice!
      </p>
    </div>,
    document.body,
  );
}

function FieldMessage({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.warning) return <p className="text-sm text-amber-800">{state.warning}</p>;
  if (state.success) return <p className="text-sm text-green-700">{state.success}</p>;
  return null;
}

function CheckInForm({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState(recordWorkArrivalCheckIn, {});
  const [locating, setLocating] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);
  const celebrated = useRef<ActionState | null>(null);

  useEffect(() => {
    if (!state.celebrate || celebrated.current === state) return;
    celebrated.current = state;
    setBurst((count) => count + 1);
  }, [state]);

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
      <CheckInCelebration burst={burst} />
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
