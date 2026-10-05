import { formatDateOnly, parseDateOnly, todayInTimeZone } from "@/lib/sleep";

/** Calendar months of history each refresh writes into step nights. */
export const STEP_SHEET_LOOKBACK_MONTHS = 1;

const MAX_STEPS = 1_000_000;

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/**
 * People whose daily steps are copied from a Google Sheet when Refresh steps
 * is pressed. Add another entry to pull someone else the same way.
 */
export const STEP_SHEET_SOURCES: StepSheetSource[] = [
  {
    email: "yipin.ng@gmail.com",
    spreadsheetId: "1aGiu36f_3QBoAsUFjMBWGH1Fw3cK-IdLtqTwhlP9Q0M",
    gid: "94106792",
    sheetName: "Steps daily",
  },
];

export type StepSheetSource = {
  email: string;
  spreadsheetId: string;
  /** Tab id from the sheet URL (`gid=`). */
  gid: string;
  sheetName: string;
};

export type SheetStepDay = {
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  steps: number;
};

export function sheetCsvUrl(source: StepSheetSource): string {
  const id = encodeURIComponent(source.spreadsheetId);
  const gid = encodeURIComponent(source.gid);
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/** Inclusive start of a rolling calendar-month window ending on `today`. */
export function stepSheetWindowStart(
  today: string,
  months = STEP_SHEET_LOOKBACK_MONTHS,
): string | null {
  const parsed = parseDateOnly(today);
  if (!parsed || !Number.isInteger(months) || months < 1) return null;

  const year = parsed.getUTCFullYear();
  const monthIndex = parsed.getUTCMonth();
  const day = parsed.getUTCDate();
  const firstOfTarget = new Date(Date.UTC(year, monthIndex - months, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const start = new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth(),
      Math.min(day, lastDay),
    ),
  );
  return formatDateOnly(start);
}

/** "30 September 2026" → "2026-09-30". */
export function parseSheetDate(value: string): string | null {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!month) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return parseDateOnly(iso) ? iso : null;
}

export function parseSheetSteps(value: string): number | null {
  const text = value.trim().replace(/,/g, "");
  if (!/^\d+$/.test(text)) return null;
  const steps = Number(text);
  if (!Number.isSafeInteger(steps) || steps < 0 || steps > MAX_STEPS) return null;
  return steps;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

/**
 * Dates in column A ("30 September 2026") and steps in column B ("12415"),
 * limited to the last calendar month through `today`. Blank step cells are
 * left alone so an unfinished day is not written as zero.
 */
export function selectSheetStepDays(csv: string, today: string): SheetStepDay[] {
  const start = stepSheetWindowStart(today);
  if (!start) return [];

  const days: SheetStepDay[] = [];
  for (const row of parseCsv(csv)) {
    const date = parseSheetDate(row[0] ?? "");
    if (!date || date < start || date > today) continue;
    const steps = parseSheetSteps(row[1] ?? "");
    if (steps === null) continue;
    days.push({ date, steps });
  }
  return days;
}

export async function fetchSheetStepDays(
  source: StepSheetSource,
  today = todayInTimeZone(),
): Promise<{ ok: true; days: SheetStepDay[] } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(sheetCsvUrl(source), {
      cache: "no-store",
      redirect: "follow",
      headers: { "User-Agent": "hunt-fund-steps-import" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Couldn’t reach ${source.sheetName} for ${source.email}: ${message}`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Couldn’t read ${source.sheetName} for ${source.email} (HTTP ${response.status}).`,
    };
  }

  const csv = await response.text();
  if (csv.trimStart().startsWith("<")) {
    return {
      ok: false,
      error: `${source.sheetName} for ${source.email} isn’t publicly readable.`,
    };
  }

  return { ok: true, days: selectSheetStepDays(csv, today) };
}
