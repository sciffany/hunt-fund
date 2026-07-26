// Reads the cached per-night summary from Supabase and turns it into a
// per-night-per-person "how late past bedtime" table.
//
// Bedtimes are constants in Singapore time (SGT / UTC+8).
//
// The dashboard reads pre-aggregated rows from the `sleep_nights` table.
// Rows there are (re)computed by the refresh button in the UI, which calls
// the `refreshNight` server action in `./actions.ts`.

export const PEOPLE = ["tiffany", "sophia", "yipin"] as const;
export type Person = (typeof PEOPLE)[number];

// Day-of-week keys, indexed the same way as JS's Date#getUTCDay():
// 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

// Bedtimes expressed as hours-since-noon-SGT of the *night's anchor date*,
// per person and per day-of-week the night begins on.
// A "night" is anchored to the date whose evening it begins on, so:
//   tiffany's 11:30pm is 11.5h after noon         -> 11.5
//   sophia's  1:00am  is next day, 13h after noon -> 13
//   yipin's   2:30am  is next day, 14.5h after noon -> 14.5
// Friday nights are 1h later for everyone.
const BEDTIME_HOURS_PAST_NOON_SGT: Record<Person, Record<DayKey, number>> = {
  tiffany: {
    sun: 11.5,
    mon: 11.5,
    tue: 11.5,
    wed: 11.5,
    thu: 11.5,
    fri: 13.5,
    sat: 13.5,
  },
  sophia: {
    sun: 13,
    mon: 13,
    tue: 13,
    wed: 13,
    thu: 13,
    fri: 15,
    sat: 15,
  },
  yipin: {
    sun: 14.5,
    mon: 14.5,
    tue: 14.5,
    wed: 14.5,
    thu: 14.5,
    fri: 16.5,
    sat: 16.5,
  },
};

export const RATE_SGD_PER_HALF_HOUR = 1.5;
const SGT_OFFSET_MIN = 8 * 60;
const HALF_HOUR_MS = 30 * 60 * 1000;

// Recent nights that always render (with a refresh button) even if they don't
// yet have a sleep_nights row. Lets brand-new nights be populated with one
// click; older nights only show once they've been refreshed at least once.
const RECENT_NIGHTS_TO_SHOW = 14;

export type Cell = {
  /** Latest activity in ms since epoch, or null if no activity that night. */
  lastActivityMs: number | null;
  /** Latest activity rounded up to the next half-hour, or null if no activity. */
  roundedMs: number | null;
  /** Number of half-hours past bedtime (0 if not past bedtime). */
  halfHours: number;
  /** True if the rounded time is strictly past this person's bedtime. */
  overdue: boolean;
};

export type NightRow = {
  /** Night anchor date in SGT, formatted YYYY-MM-DD. */
  night: string;
  /** Latest updated_at across this night's sleep_nights rows, or null if none. */
  refreshedAt: string | null;
  cells: Record<Person, Cell>;
};

export type DashboardData = {
  rows: NightRow[];
  totals: Record<Person, number>;
  fetchedAt: string;
  error?: string;
};

type SleepNightRow = {
  user_name: string;
  night: string; // YYYY-MM-DD (Postgres date serialises as ISO date)
  last_activity: string | null;
  updated_at: string | null;
};

function supabaseEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable.",
    );
  }
  return { url, key };
}

async function fetchSleepNights(): Promise<SleepNightRow[]> {
  const { url, key } = supabaseEnv();
  const people = PEOPLE.map((p) => `"${p}"`).join(",");
  const endpoint =
    `${url}/rest/v1/sleep_nights` +
    `?select=user_name,night,last_activity,updated_at` +
    `&user_name=in.(${people})` +
    `&order=night.desc`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase fetch failed: ${res.status} ${body}`);
  }
  return (await res.json()) as SleepNightRow[];
}

/**
 * Given a Date (in any tz), return the "night anchor date" in SGT as a
 * YYYY-MM-DD string. Events at/after noon SGT belong to that day's night;
 * events before noon SGT belong to the previous day's night.
 */
function nightKeyForSGT(d: Date): string {
  const sgtMs = d.getTime() + SGT_OFFSET_MIN * 60 * 1000;
  // Shift by 12h so "noon SGT" becomes the day boundary.
  const anchor = new Date(sgtMs - 12 * 60 * 60 * 1000);
  const y = anchor.getUTCFullYear();
  const m = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const day = String(anchor.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Day-of-week the night anchored to `nightKey` begins on (in SGT). */
function nightDayKey(nightKey: string): DayKey {
  const [y, m, d] = nightKey.split("-").map(Number);
  return DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Bedtime for `person` on the night anchored to `nightKey` (YYYY-MM-DD in SGT),
 * returned as ms since epoch (UTC).
 */
function bedtimeMs(person: Person, nightKey: string): number {
  const [y, m, d] = nightKey.split("-").map(Number);
  // Noon SGT on the anchor date = 04:00 UTC on that date.
  const noonSgtUtcMs = Date.UTC(y, m - 1, d, 4, 0, 0, 0);
  const hours = BEDTIME_HOURS_PAST_NOON_SGT[person][nightDayKey(nightKey)];
  return noonSgtUtcMs + hours * 60 * 60 * 1000;
}

/** Format an hours-past-noon-SGT value like 11.5 as "11:30 PM". */
function formatBedtimeHours(hoursPastNoon: number): string {
  const totalMinutes = Math.round(hoursPastNoon * 60);
  const hour24 = (12 + Math.floor(totalMinutes / 60)) % 24;
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

/**
 * Human-readable summary of a person's bedtime schedule: their most common
 * bedtime plus any per-day exceptions. Lets the UI show e.g.
 *   "11:30 PM (Fri 12:30 AM)"
 * without hard-coding which day is the odd one out.
 */
export function bedtimeSummary(person: Person): {
  main: string;
  exceptions: { day: string; label: string }[];
} {
  const perDay = BEDTIME_HOURS_PAST_NOON_SGT[person];
  const counts = new Map<number, number>();
  for (const day of DAY_KEYS) {
    counts.set(perDay[day], (counts.get(perDay[day]) ?? 0) + 1);
  }
  let mainHours = perDay.mon;
  let bestCount = -1;
  for (const [h, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      mainHours = h;
    }
  }
  const exceptions: { day: string; label: string }[] = [];
  for (const day of DAY_KEYS) {
    if (perDay[day] !== mainHours) {
      exceptions.push({
        day: DAY_LABELS[day],
        label: formatBedtimeHours(perDay[day]),
      });
    }
  }
  return { main: formatBedtimeHours(mainHours), exceptions };
}

function ceilToHalfHour(ms: number): number {
  return Math.ceil(ms / HALF_HOUR_MS) * HALF_HOUR_MS;
}

/**
 * UTC-ms boundaries of the SGT-anchored night for `nightKey`. `startMs` is
 * noon SGT on the anchor day; `endMs` is 6am SGT the following day (18h
 * later). Used by the refresh action when scanning sleep_events for a
 * single night — matches the bot's 8pm–6am logging window.
 */
export function nightWindowSGT(nightKey: string): {
  startMs: number;
  endMs: number;
} {
  const [y, m, d] = nightKey.split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, d, 4, 0, 0, 0);
  return { startMs, endMs: startMs + 18 * 60 * 60 * 1000 };
}

function buildCell(person: Person, night: string, lastMs: number | null): Cell {
  if (lastMs === null) {
    return {
      lastActivityMs: null,
      roundedMs: null,
      halfHours: 0,
      overdue: false,
    };
  }
  const bed = bedtimeMs(person, night);
  const rounded = ceilToHalfHour(lastMs);
  const overdue = lastMs > bed;
  const halfHours = overdue
    ? Math.max(0, Math.round((rounded - bed) / HALF_HOUR_MS))
    : 0;
  return { lastActivityMs: lastMs, roundedMs: rounded, halfHours, overdue };
}

/** Return the last `n` SGT-anchored night keys, oldest first. */
function recentNightKeys(n: number): string[] {
  const keys: string[] = [];
  const today = nightKeyForSGT(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const startUtc = Date.UTC(y, m - 1, d);
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(startUtc - i * 24 * 60 * 60 * 1000);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    keys.push(`${yy}-${mm}-${dd}`);
  }
  return keys;
}

function emptyTotals(): Record<Person, number> {
  return Object.fromEntries(PEOPLE.map((p) => [p, 0])) as Record<
    Person,
    number
  >;
}

export async function loadDashboardData(): Promise<DashboardData> {
  let rowsData: SleepNightRow[];
  try {
    rowsData = await fetchSleepNights();
  } catch (err) {
    return {
      rows: [],
      totals: emptyTotals(),
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Index the fetched rows by (night, person), and track the newest updated_at
  // per night so the UI can show when it was last refreshed.
  const byNight = new Map<string, Map<Person, number>>();
  const refreshedAt = new Map<string, string>();
  for (const r of rowsData) {
    if (!PEOPLE.includes(r.user_name as Person)) continue;
    const person = r.user_name as Person;
    const night = r.night.slice(0, 10);
    if (r.updated_at) {
      const prev = refreshedAt.get(night);
      if (!prev || r.updated_at > prev) refreshedAt.set(night, r.updated_at);
    }
    let row = byNight.get(night);
    if (!row) {
      row = new Map();
      byNight.set(night, row);
    }
    if (r.last_activity == null) continue;
    const t = Date.parse(r.last_activity);
    if (Number.isNaN(t)) continue;
    row.set(person, t);
  }

  // Union of nights we know about + the last N recent nights. Recent nights
  // that haven't been refreshed yet still render (as empty rows) so the user
  // has a refresh button to click.
  const nightSet = new Set<string>(byNight.keys());
  for (const k of recentNightKeys(RECENT_NIGHTS_TO_SHOW)) nightSet.add(k);

  const totals = emptyTotals();
  const rows: NightRow[] = [];
  const sortedNights = Array.from(nightSet).sort();
  for (const night of sortedNights) {
    const row = byNight.get(night);
    const cells = {} as Record<Person, Cell>;
    for (const person of PEOPLE) {
      const last = row?.get(person) ?? null;
      const cell = buildCell(person, night, last);
      if (cell.overdue) totals[person] += cell.halfHours;
      cells[person] = cell;
    }
    rows.push({ night, refreshedAt: refreshedAt.get(night) ?? null, cells });
  }

  // Show most recent night first.
  rows.reverse();
  return { rows, totals, fetchedAt: new Date().toISOString() };
}

/** Format ms as HH:MM AM/PM in SGT. */
export function formatSGT(ms: number): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

/** Format a YYYY-MM-DD anchor date as e.g. "Wed, 23 Jul 2026". */
export function formatNight(night: string): string {
  const [y, m, d] = night.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(dt);
}
