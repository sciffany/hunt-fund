// Fetches sleep activity events from Supabase and turns them into a
// per-night-per-person "how late past bedtime" table.
//
// Bedtimes are constants in Singapore time (SGT / UTC+8).

export const PEOPLE = ["sample", "tiffany", "sophia", "yipin"] as const;
export type Person = (typeof PEOPLE)[number];

// Bedtimes expressed as minutes-since-noon-SGT of the *night's anchor date*.
// A "night" is anchored to the date whose evening it begins on, so:
//   sample's  10:00pm is 10h after noon           -> 600 min
//   tiffany's 11:30pm is 11.5h after noon         -> 690 min
//   sophia's  1:00am  is next day, 13h after noon -> 780 min
//   yipin's   2:00am  is next day, 14h after noon -> 840 min
const BEDTIME_MIN_PAST_NOON_SGT: Record<Person, number> = {
  sample: 10 * 60,
  tiffany: 11.5 * 60,
  sophia: 13 * 60,
  yipin: 14 * 60,
};

export const RATE_SGD_PER_HALF_HOUR = 1.5;
const SGT_OFFSET_MIN = 8 * 60;
const HALF_HOUR_MS = 30 * 60 * 1000;

export type Cell = {
  /** Latest activity in ms since epoch, or null if no activity that night. */
  lastActivityMs: number | null;
  /** Rounded-up-to-half-hour time in ms, only set if past bedtime. */
  roundedMs: number | null;
  /** Number of half-hours past bedtime (0 if not past bedtime). */
  halfHours: number;
};

export type NightRow = {
  /** Night anchor date in SGT, formatted YYYY-MM-DD. */
  night: string;
  cells: Record<Person, Cell>;
};

export type DashboardData = {
  rows: NightRow[];
  totals: Record<Person, number>;
  fetchedAt: string;
  error?: string;
};

type RawEvent = { user_name: string; event_time: string };

async function fetchEvents(): Promise<RawEvent[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable."
    );
  }

  const people = PEOPLE.map((p) => `"${p}"`).join(",");
  const endpoint =
    `${url}/rest/v1/sleep_events` +
    `?select=user_name,event_time` +
    `&event_type=eq.activity` +
    `&user_name=in.(${people})` +
    `&order=event_time.asc` +
    `&limit=10000`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    // Always pull fresh data at request time.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase fetch failed: ${res.status} ${body}`);
  }

  return (await res.json()) as RawEvent[];
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

/**
 * Bedtime for `person` on the night anchored to `nightKey` (YYYY-MM-DD in SGT),
 * returned as ms since epoch (UTC).
 */
function bedtimeMs(person: Person, nightKey: string): number {
  const [y, m, d] = nightKey.split("-").map(Number);
  // Noon SGT on the anchor date = 04:00 UTC on that date.
  const noonSgtUtcMs = Date.UTC(y, m - 1, d, 4, 0, 0, 0);
  return noonSgtUtcMs + BEDTIME_MIN_PAST_NOON_SGT[person] * 60 * 1000;
}

function ceilToHalfHour(ms: number): number {
  return Math.ceil(ms / HALF_HOUR_MS) * HALF_HOUR_MS;
}

export async function loadDashboardData(): Promise<DashboardData> {
  let events: RawEvent[];
  try {
    events = await fetchEvents();
  } catch (err) {
    return {
      rows: [],
      totals: { sample: 0, tiffany: 0, sophia: 0, yipin: 0 },
      fetchedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Reduce to latest activity per (person, night).
  const latest = new Map<string, Map<Person, number>>();
  for (const ev of events) {
    if (!PEOPLE.includes(ev.user_name as Person)) continue;
    const person = ev.user_name as Person;
    const t = Date.parse(ev.event_time);
    if (Number.isNaN(t)) continue;
    const key = nightKeyForSGT(new Date(t));
    let row = latest.get(key);
    if (!row) {
      row = new Map();
      latest.set(key, row);
    }
    const prev = row.get(person);
    if (prev === undefined || t > prev) row.set(person, t);
  }

  const totals: Record<Person, number> = {
    sample: 0,
    tiffany: 0,
    sophia: 0,
    yipin: 0,
  };
  const rows: NightRow[] = [];

  const sortedNights = Array.from(latest.keys()).sort();
  for (const night of sortedNights) {
    const row = latest.get(night)!;
    const cells = {} as Record<Person, Cell>;
    for (const person of PEOPLE) {
      const last = row.get(person) ?? null;
      const bed = bedtimeMs(person, night);
      if (last === null || last <= bed) {
        cells[person] = { lastActivityMs: last, roundedMs: null, halfHours: 0 };
      } else {
        const rounded = ceilToHalfHour(last);
        const halfHours = Math.max(0, Math.round((rounded - bed) / HALF_HOUR_MS));
        totals[person] += halfHours;
        cells[person] = { lastActivityMs: last, roundedMs: rounded, halfHours };
      }
    }
    rows.push({ night, cells });
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
