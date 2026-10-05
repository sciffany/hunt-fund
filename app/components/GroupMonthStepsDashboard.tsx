import {
  DashboardMetricCell,
  DashboardMonthTable,
  DashboardSection,
} from "@/components/dashboard";
import { RefreshStepsButton } from "@/components/RefreshStepsButton";
import { type YearMonth } from "@/lib/month";

export type StepsDashboardCell = {
  steps: number | null;
  below: boolean;
  penaltyLabel: string | null;
};

export type StepsDashboardMember = {
  id: string;
  displayName: string;
  cells: Record<string, StepsDashboardCell>;
  totalPenalty: string;
};

function formatSteps(steps: number): string {
  return steps.toLocaleString("en-US");
}

export function GroupMonthStepsDashboard({
  groupId,
  month,
  members,
  today,
  dateNotes,
}: {
  groupId: string;
  month: YearMonth;
  members: StepsDashboardMember[];
  today: string;
  dateNotes?: Record<string, string[]>;
}) {
  const memberById = new Map(members.map((member) => [member.id, member]));

  return (
    <DashboardSection
      title="Daily steps"
      description="Total steps for each day. Highlighted cells missed the target."
      actions={<RefreshStepsButton groupId={groupId} />}
    >
      <DashboardMonthTable
        month={month}
        members={members}
        today={today}
        footerValues={members.map((member) => member.totalPenalty)}
        dateNotes={dateNotes}
        renderCell={(memberId, date) => {
          const cell = memberById.get(memberId)?.cells[date];
          const steps = cell?.steps;
          return (
            <DashboardMetricCell
              value={steps === null || steps === undefined ? null : formatSteps(steps)}
              flagged={cell?.below ?? false}
              penaltyLabel={cell?.penaltyLabel ?? null}
            />
          );
        }}
      />
    </DashboardSection>
  );
}
