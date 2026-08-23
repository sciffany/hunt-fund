import type { ReactNode } from "react";
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

const AVATAR_TONES = [
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-900",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
] as const;

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function memberAvatarTone(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3.5">
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

function MemberColumnHeader({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${memberAvatarTone(name)}`}
      >
        {memberInitials(name)}
      </span>
      <span className="truncate">{name}</span>
    </div>
  );
}

export function DashboardMetricCell({
  value,
  flagged,
  penaltyLabel,
}: {
  value: string | null;
  flagged: boolean;
  penaltyLabel: string | null;
}) {
  return (
    <div className={`flex h-full min-h-[2.5rem] items-start px-3 py-2 ${flagged ? "bg-rose-50" : ""}`}>
      {value === null ? (
        <span className="text-neutral-300">—</span>
      ) : (
        <div>
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

function rowSurfaceClass(date: string, today: string): string {
  if (date === today) return "bg-sky-50";
  if (isWeekend(date)) return "bg-neutral-50";
  return "bg-white";
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
          <tr className="border-b border-neutral-200">
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
                className="border-l border-neutral-100 bg-neutral-50 px-3 py-2.5 text-left text-xs font-medium text-neutral-700"
              >
                <MemberColumnHeader name={member.displayName} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const isToday = date === today;
            const surface = rowSurfaceClass(date, today);

            return (
              <tr key={date} className={`border-t border-neutral-100 ${surface}`}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 px-3 py-2 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] ${surface} ${
                    isToday ? "text-sky-950" : "text-neutral-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="tabular-nums">{dayOfMonth(date)}</span>
                      <span
                        className={`text-xs font-normal ${
                          isToday ? "font-medium text-sky-700" : "text-neutral-500"
                        }`}
                      >
                        {isToday ? "Today" : weekdayShort(date)}
                      </span>
                    </span>
                    {dateAccessory?.(date)}
                  </div>
                </th>
                {members.map((member) => (
                  <td key={member.id} className="h-px border-l border-neutral-100 p-0">
                    {renderCell(member.id, date)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-200 bg-rose-50">
            <th
              scope="row"
              className="sticky left-0 z-10 bg-rose-50 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-rose-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]"
            >
              Penalty
            </th>
            {members.map((member, index) => (
              <td
                key={member.id}
                className="border-l border-rose-100 px-3 py-2.5 font-medium tabular-nums text-rose-900"
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

