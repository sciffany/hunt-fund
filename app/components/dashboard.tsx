import type { ReactNode } from "react";
import Link from "next/link";
import {
  datesInMonth,
  dayOfMonth,
  formatMonthLabel,
  formatYearMonth,
  shiftYearMonth,
  weekdayShort,
  type YearMonth,
} from "@/lib/month";

export function DashboardMonthNav({
  groupId,
  month,
}: {
  groupId: string;
  month: YearMonth;
}) {
  const previous = formatYearMonth(shiftYearMonth(month, -1));
  const next = formatYearMonth(shiftYearMonth(month, 1));

  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      <Link
        href={`/groups/${groupId}?month=${previous}`}
        aria-label="Previous month"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 shadow-sm hover:bg-neutral-50 hover:text-neutral-900"
      >
        <span aria-hidden className="text-lg leading-none">
          ‹
        </span>
      </Link>
      <p className="min-w-40 text-center text-sm font-semibold tracking-tight text-neutral-900">
        {formatMonthLabel(month)}
      </p>
      <Link
        href={`/groups/${groupId}?month=${next}`}
        aria-label="Next month"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 shadow-sm hover:bg-neutral-50 hover:text-neutral-900"
      >
        <span aria-hidden className="text-lg leading-none">
          ›
        </span>
      </Link>
    </div>
  );
}

export function DashboardSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DashboardMetricCell({
  value,
  flagged,
  penaltyLabel,
  className = "",
}: {
  value: string | null;
  flagged: boolean;
  penaltyLabel: string | null;
  className?: string;
}) {
  return (
    <div
      className={`flex h-14 items-center justify-end overflow-hidden px-3 ${flagged ? "bg-rose-50" : ""} ${className}`}
    >
      {value === null ? (
        <span className="text-neutral-300">—</span>
      ) : (
        <div className="text-right leading-tight">
          <span
            className={`tabular-nums ${
              flagged ? "font-medium text-rose-950" : "text-neutral-800"
            }`}
          >
            {value}
          </span>
          {flagged && penaltyLabel ? (
            <span className="mt-0.5 block text-xs tabular-nums text-rose-700">
              {penaltyLabel}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function rowSurfaceClass(date: string): string {
  return dayOfMonth(date) % 2 === 0 ? "bg-neutral-50" : "bg-white";
}

export function DashboardMonthTable({
  month,
  members,
  today,
  dateAccessory,
  renderCell,
  footerValues,
}: {
  month: YearMonth;
  members: { id: string; displayName: string }[];
  today: string;
  dateAccessory?: (date: string) => ReactNode;
  renderCell: (memberId: string, date: string) => ReactNode;
  footerValues: string[];
}) {
  const dates = datesInMonth(month);

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{
          minWidth: `calc(8rem + ${Math.max(members.length, 1) * 9}rem)`,
        }}
      >
        <colgroup>
          <col className="w-32" />
          {members.map((member) => (
            <col key={member.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-neutral-300">
            <th
              scope="col"
              className="sticky left-0 z-20 bg-neutral-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]"
            >
              Date
            </th>
            {members.map((member) => (
              <th
                key={member.id}
                scope="col"
                title={member.displayName}
                className="min-w-0 border-l border-neutral-200 bg-neutral-50 px-3 py-2.5 text-left text-xs font-medium text-neutral-700"
              >
                <span className="block truncate">{member.displayName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const isToday = date === today;
            const surface = rowSurfaceClass(date);

            return (
              <tr key={date} className={`border-t border-neutral-200 ${surface}`}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 h-14 px-3 text-left font-medium text-neutral-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${surface}`}
                >
                  <div className="flex h-full items-center justify-between gap-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="inline-block w-6 text-right tabular-nums">
                        {dayOfMonth(date)}
                      </span>
                      <span className="text-xs font-normal text-neutral-500">
                        {isToday ? "Today" : weekdayShort(date)}
                      </span>
                    </span>
                    {dateAccessory?.(date)}
                  </div>
                </th>
                {members.map((member) => (
                  <td key={member.id} className="h-14 border-l border-neutral-200 p-0">
                    {renderCell(member.id, date)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-300 bg-rose-50">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-rose-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-rose-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]"
            >
              Penalty
            </th>
            {members.map((member, index) => (
              <td
                key={member.id}
                className="border-l border-rose-200 px-3 py-2.5 text-right font-medium tabular-nums text-rose-900"
              >
                {footerValues[index]}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

