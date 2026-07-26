"use server";

// Server actions that (re)populate rows in the `sleep_nights` table. The
// dashboard's per-row refresh button calls `refreshNight` for a single date;
// it computes MAX(event_time) per person over that night's SGT-anchored
// window and upserts one row per person into sleep_nights.

import { revalidatePath } from "next/cache";
import { PEOPLE, type Person, nightWindowSGT } from "./data";

const NIGHT_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type RefreshResult =
  | { ok: true; night: string; updated: number }
  | { ok: false; night: string; error: string };

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

/**
 * Effective "last activity" time for `person` over [startIso, endIso).
 *
 * We look at the latest `activity`, `phone_activity`, or `app_close` event
 * in the window:
 *   - If it's an `activity` or `phone_activity`, we use its timestamp.
 *     `phone_activity` rows come from the Android app's screen-state
 *     broadcasts; `activity` rows come from the desktop tracker.
 *   - If it's an `app_close`, the desktop tracker was shut down after the
 *     person's final activity, so we can't tell when they actually stopped
 *     being active. Treat that as "still up at the end of the tracking
 *     window" by returning 6am SGT (endIso), the maximum penalty.
 *
 * Returns null if there are no relevant events in the window.
 */
async function maxActivityFor(
  person: Person,
  startIso: string,
  endIso: string,
): Promise<string | null> {
  const { url, key } = supabaseEnv();
  const endpoint =
    `${url}/rest/v1/sleep_events` +
    `?select=event_time,event_type` +
    `&event_type=in.(activity,phone_activity,app_close)` +
    `&user_name=eq.${encodeURIComponent(person)}` +
    `&event_time=gte.${encodeURIComponent(startIso)}` +
    `&event_time=lt.${encodeURIComponent(endIso)}` +
    `&order=event_time.desc` +
    `&limit=1`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `sleep_events select failed: ${res.status} ${await res.text()}`,
    );
  }
  const rows = (await res.json()) as {
    event_time: string;
    event_type: "activity" | "phone_activity" | "app_close";
  }[];
  const latest = rows[0];
  if (!latest) return null;
  if (latest.event_type === "app_close") return endIso;
  return latest.event_time;
}

async function upsertSleepNightRows(
  rows: { user_name: string; night: string; last_activity: string | null }[],
): Promise<void> {
  if (rows.length === 0) return;
  const { url, key } = supabaseEnv();
  const now = new Date().toISOString();
  const body = rows.map((r) => ({ ...r, updated_at: now }));
  const endpoint = `${url}/rest/v1/sleep_nights?on_conflict=user_name,night`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `sleep_nights upsert failed: ${res.status} ${await res.text()}`,
    );
  }
}

/**
 * Recalculate the latest activity per person for one SGT-anchored night,
 * and upsert the results into `sleep_nights`. Safe to call repeatedly.
 */
export async function refreshNight(nightKey: string): Promise<RefreshResult> {
  if (!NIGHT_KEY_RE.test(nightKey)) {
    return { ok: false, night: nightKey, error: `Invalid night: ${nightKey}` };
  }
  try {
    const { startMs, endMs } = nightWindowSGT(nightKey);
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();

    // Four small queries (one per person), each returning at most one row.
    // Well under any per-request row limit.
    const rows = await Promise.all(
      PEOPLE.map(async (person) => ({
        user_name: person,
        night: nightKey,
        last_activity: await maxActivityFor(person, startIso, endIso),
      })),
    );

    await upsertSleepNightRows(rows);
    revalidatePath("/");
    return { ok: true, night: nightKey, updated: rows.length };
  } catch (err) {
    return {
      ok: false,
      night: nightKey,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
