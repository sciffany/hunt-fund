import { Fragment, type ReactNode } from "react";
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
    <div className="mt-4 flex items-center justify-center gap-2 sm:mt-8">
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
    <section className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm sm:mt-6">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-neutral-200 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3.5">
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
      className={`flex h-full min-h-11 items-center justify-end overflow-hidden px-0.5 sm:min-h-14 sm:px-1.5 ${flagged ? "bg-rose-50" : ""} ${className}`}
    >
      {value === null ? (
        <span className="text-neutral-300">—</span>
      ) : (
        <div className="min-w-0 text-right leading-tight">
          <span
            className={`block truncate tabular-nums ${
              flagged ? "font-medium text-rose-950" : "text-neutral-800"
            }`}
          >
            {value}
          </span>
          {flagged && penaltyLabel ? (
            <span className="mt-0.5 block truncate text-[10px] tabular-nums text-rose-700">
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
  dateNotes,
  renderCell,
  footerValues,
}: {
  month: YearMonth;
  members: { id: string; displayName: string }[];
  today: string;
  dateAccessory?: (date: string) => ReactNode;
  dateNotes?: Record<string, string[]>;
  renderCell: (memberId: string, date: string) => ReactNode;
  footerValues: string[];
}) {
  const dates = datesInMonth(month);
  // Up to five people share the screen. More than that scroll, with each
  // person at least --member-col wide. --date-col is narrower on phones.
  const fitsOnScreen = members.length <= 5;

  return (
    <div className="overflow-x-auto @container">
      <table
        className="dashboard-month-table w-full table-fixed border-collapse text-[11px] sm:text-xs"
        data-fit={fitsOnScreen ? "true" : undefined}
        style={
          fitsOnScreen
            ? undefined
            : {
                minWidth: `calc(var(--date-col) + ${members.length} * var(--member-col))`,
              }
        }
      >
        <colgroup>
          <col className="dashboard-date-col" style={{ width: "var(--date-col)" }} />
          {members.map((member) => (
            <col key={member.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-neutral-300">
            <th
              scope="col"
              className="sticky left-0 z-20 max-w-[var(--date-col)] overflow-hidden bg-neutral-50 px-0.5 py-1.5 text-left text-[9px] font-medium uppercase tracking-tight text-neutral-500 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] sm:py-2.5 sm:text-[10px]"
            >
              Date
            </th>
            {members.map((member) => (
              <th
                key={member.id}
                scope="col"
                title={member.displayName}
                className="min-w-0 border-l border-neutral-200 bg-neutral-50 px-0.5 py-1.5 text-left text-[11px] font-medium text-neutral-700 sm:px-1.5 sm:py-2.5"
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
            const notes = dateNotes?.[date] ?? [];

            return (
              <Fragment key={date}>
                {notes.length > 0 ? (
                  <tr className={`border-t border-neutral-200 ${surface}`}>
                    <td colSpan={members.length + 1} className="p-0">
                      <div className="sticky left-0 w-[100cqw] max-w-full px-1 py-1">
                        <div className="rounded-md border border-neutral-200 bg-white px-2 py-1 shadow-sm">
                          <div className="space-y-0.5">
                            {notes.map((note, index) => (
                              <p
                                key={`${note}-${index}`}
                                className="break-words text-[10px] font-normal leading-snug text-neutral-600 sm:text-[11px]"
                              >
                                {note}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
                <tr className={`border-t border-neutral-200 ${surface}`}>
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 max-w-[var(--date-col)] overflow-hidden px-0.5 text-left font-medium text-neutral-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${surface}`}
                  >
                    <div className="flex h-11 items-center sm:h-14">
                      <div className="flex w-full items-center justify-between gap-px">
                        <span className="flex min-w-0 flex-col leading-none">
                          <span className="tabular-nums">{dayOfMonth(date)}</span>
                          <span className="truncate text-[9px] font-normal text-neutral-500">
                            {isToday ? "Today" : weekdayShort(date)}
                          </span>
                        </span>
                        {dateAccessory?.(date)}
                      </div>
                    </div>
                  </th>
                  {members.map((member) => (
                    <td
                      key={member.id}
                      className="relative min-w-0 border-l border-neutral-200 p-0"
                    >
                      <div className="h-11 sm:h-14" aria-hidden />
                      <div className="absolute inset-0">
                        {renderCell(member.id, date)}
                      </div>
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-300 bg-rose-50">
            <th
              scope="row"
              className="sticky left-0 z-10 max-w-[var(--date-col)] overflow-hidden bg-rose-50 px-0.5 py-2 text-left text-[9px] font-medium uppercase tracking-tight text-rose-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] sm:py-2.5 sm:text-[10px]"
            >
              Penalty
            </th>
            {members.map((member, index) => (
              <td
                key={member.id}
                className="min-w-0 border-l border-rose-200 px-0.5 py-2 text-right text-[11px] font-medium tabular-nums text-rose-900 sm:px-1.5 sm:py-2.5"
              >
                <span className="block truncate">{footerValues[index]}</span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

