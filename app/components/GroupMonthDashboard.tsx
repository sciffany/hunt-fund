import {
  DashboardMetricCell,
  DashboardMonthTable,
  DashboardSection,
} from "@/components/dashboard";
import { PruneSleepEventsButton } from "@/components/PruneSleepEventsButton";
import { RefreshSleepNightButton } from "@/components/RefreshSleepNightButton";
import { type YearMonth } from "@/lib/month";
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

  return (
    <DashboardSection
      title="Latest sleep time"
      description="Last phone activity after 8:00 PM. Highlighted cells missed bedtime."
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
          const cell = memberById.get(memberId)?.cells[date];
          return (
            <DashboardMetricCell
              value={cell?.time ?? null}
              flagged={cell?.overdue ?? false}
              penaltyLabel={cell?.penaltyLabel ?? null}
            />
          );
        }}
      />
    </DashboardSection>
  );
}
