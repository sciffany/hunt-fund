"use client";

import { useState } from "react";
import {
  DashboardMetricCell,
  DashboardMonthTable,
  DashboardSection,
} from "@/components/dashboard";
import { PruneSleepEventsButton } from "@/components/PruneSleepEventsButton";
import { RefreshSleepNightButton } from "@/components/RefreshSleepNightButton";
import { SleepNightEventsDialog } from "@/components/SleepNightEventsDialog";
import { weekdayShort, type YearMonth } from "@/lib/month";
import { isNightRefreshable } from "@/lib/sleep";

export type DashboardCell = {
  time: string | null;
  overdue: boolean;
  penaltyLabel: string | null;
};

export type DashboardMember = {
  id: string;
  displayName: string;
  cells: Record<string, DashboardCell>;
  totalPenalty: string;
};

export function GroupMonthDashboard({
  groupId,
  month,
  members,
  today,
}: {
  groupId: string;
  month: YearMonth;
  members: DashboardMember[];
  today: string;
}) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const [selection, setSelection] = useState<{
    memberId: string;
    date: string;
  } | null>(null);
  const selectedMember = selection
    ? memberById.get(selection.memberId)
    : undefined;
  const selectedCell = selection
    ? selectedMember?.cells[selection.date]
    : undefined;

  return (
    <DashboardSection
      title="Latest sleep time"
      description="Last phone activity after 8:00 PM. Highlighted cells missed bedtime. Click a cell to see the events behind it."
      actions={<PruneSleepEventsButton groupId={groupId} />}
    >
      <DashboardMonthTable
        month={month}
        members={members}
        today={today}
        footerValues={members.map((member) => member.totalPenalty)}
        dateAccessory={(date) =>
          isNightRefreshable(date, today) ? (
            <RefreshSleepNightButton groupId={groupId} night={date} />
          ) : null
        }
        renderCell={(memberId, date) => {
          const member = memberById.get(memberId);
          const cell = member?.cells[date];
          const flagged = cell?.overdue ?? false;
          const label = `${member?.displayName ?? "Member"}, ${weekdayShort(date)} ${date}`;
          return (
            <button
              type="button"
              className="group block w-full cursor-pointer text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-400"
              aria-label={`View sleep events for ${label}`}
              onClick={() => setSelection({ memberId, date })}
            >
              <DashboardMetricCell
                value={cell?.time ?? null}
                flagged={flagged}
                penaltyLabel={cell?.penaltyLabel ?? null}
                className={
                  flagged ? "group-hover:bg-rose-100" : "group-hover:bg-neutral-100"
                }
              />
            </button>
          );
        }}
      />
      {selection && selectedMember ? (
        <SleepNightEventsDialog
          key={`${selection.memberId}:${selection.date}`}
          groupId={groupId}
          memberId={selection.memberId}
          memberName={selectedMember.displayName}
          night={selection.date}
          tableTime={selectedCell?.time ?? null}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </DashboardSection>
  );
}
