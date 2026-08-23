import Link from "next/link";
import {
  datesInMonth,
  dayOfMonth,
  formatMonthLabel,
  formatYearMonth,
  isWeekend,
  shiftYearMonth,
  weekdayShort,
  type YearMonth,
} from "@/lib/month";

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
  const dates = datesInMonth(month);
  const previous = formatYearMonth(shiftYearMonth(month, -1));
  const next = formatYearMonth(shiftYearMonth(month, 1));

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/groups/${groupId}?month=${previous}`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          Previous
        </Link>
        <h2 className="text-sm font-medium text-neutral-900">
          {formatMonthLabel(month)}
        </h2>
        <Link
          href={`/groups/${groupId}?month=${next}`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          Next
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-neutral-200 bg-white">
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{
            minWidth: `calc(6rem + ${Math.max(members.length, 1) * 9}rem)`,
          }}
        >
          <colgroup>
            <col className="w-24" />
            {members.map((member) => (
              <col key={member.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-neutral-200">
              <th
                scope="col"
                className="sticky left-0 z-20 bg-white px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500"
              >
                Date
              </th>
              {members.map((member) => (
                <th
                  key={member.id}
                  scope="col"
                  title={member.displayName}
                  className="border-l border-neutral-200 px-3 py-2 text-left text-xs font-medium text-neutral-700"
                >
                  <span className="block truncate">{member.displayName}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const isToday = date === today;
              const weekend = isWeekend(date);
              const rowClass = isToday
                ? "bg-neutral-50"
                : weekend
                  ? "bg-neutral-50/60"
                  : "bg-white";

              return (
                <tr key={date} className={`border-t border-neutral-200 ${rowClass}`}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 px-3 py-2 text-left font-medium ${rowClass} ${
                      isToday ? "text-neutral-900" : "text-neutral-700"
                    }`}
                  >
                    <span className="tabular-nums">{dayOfMonth(date)}</span>
                    <span className="ml-1.5 text-xs font-normal text-neutral-500">
                      {weekdayShort(date)}
                    </span>
                  </th>
                  {members.map((member) => {
                    const cell = member.cells[date];
                    const overdue = cell?.overdue ?? false;
                    return (
                      <td
                        key={member.id}
                        className={`border-l border-neutral-200 px-3 py-2 ${
                          overdue
                            ? "bg-red-200 text-red-950"
                            : ""
                        }`}
                      >
                        {cell?.time ? (
                          <div>
                            <span className="tabular-nums">{cell.time}</span>
                            {overdue && cell.penaltyLabel ? (
                              <span className="mt-0.5 block text-xs tabular-nums text-red-800">
                                {cell.penaltyLabel}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-300 bg-red-50">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-red-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-red-800"
              >
                Penalty
              </th>
              {members.map((member) => (
                <td
                  key={member.id}
                  className="border-l border-neutral-200 px-3 py-2 font-medium tabular-nums text-red-900"
                >
                  {member.totalPenalty}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
