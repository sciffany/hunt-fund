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

export type DashboardMember = {
  id: string;
  displayName: string;
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
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-20 bg-white px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500"
              >
                Date
              </th>
              {members.map((member) => (
                <th
                  key={member.id}
                  scope="col"
                  className="min-w-28 border-l border-neutral-200 px-3 py-2 text-left text-xs font-medium text-neutral-700"
                >
                  {member.displayName}
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
                  {members.map((member) => (
                    <td
                      key={member.id}
                      className="border-l border-neutral-200 px-3 py-2"
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
