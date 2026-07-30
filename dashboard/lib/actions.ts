"use server";

// Server actions that (re)populate rows in the `sleep_nights` table. The
// dashboard's per-row refresh button calls `refreshNight` for a single date;
// it computes MAX(event_time) per person over that night's SGT-anchored
// window and upserts one row per person into sleep_nights.

import { revalidatePath } from "next/cache";
import {
  PEOPLE,
  RETENTION_DAYS,
  isNightRefreshable,
  nightWindowSGT,
  type Person,
} from "./data";

const NIGHT_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type RefreshResult =
  | { ok: true; night: string; updated: number }
  | { ok: false; night: string; error: string };

export type PruneResult =
  | { ok: true; deleted: number; cutoff: string }
  | { ok: false; error: string };

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
  // Guard against overwriting a good cached sleep_nights row with a partial
  // recompute after the raw events have been pruned. sleep_nights is the
  // historical record for nights older than the retention window.
  if (!isNightRefreshable(nightKey)) {
    return {
      ok: false,
      night: nightKey,
      error: `Raw events for ${nightKey} are outside the ${RETENTION_DAYS}-day retention window and have been pruned; this night is frozen.`,
    };
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

// PostgREST DELETE with `Prefer: count=exact` returns the deleted row count
// in the `Content-Range` header (format like "0-<star>/24" or "<star>/24" —
// spelled out because a literal star-slash would close this comment). Grab
// whatever integer follows the final slash; return null if we can't parse.
function parseDeletedCount(contentRange: string | null): number | null {
  if (!contentRange) return null;
  const idx = contentRange.lastIndexOf("/");
  if (idx < 0) return null;
  const n = Number.parseInt(contentRange.slice(idx + 1), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Delete rows from `sleep_events` older than the retention cutoff
 * (now - RETENTION_DAYS). sleep_nights is untouched — its rows are the
 * cached historical record and don't depend on sleep_events being present.
 *
 * The per-row refresh button is disabled for nights outside the retention
 * window (see isNightRefreshable), so pruning can't cause a subsequent
 * refresh click to null out a good historical row.
 */
export async function pruneOldEvents(): Promise<PruneResult> {
  try {
    const { url, key } = supabaseEnv();
    const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const endpoint =
      `${url}/rest/v1/sleep_events` +
      `?event_time=lt.${encodeURIComponent(cutoffIso)}`;

    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal, count=exact",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `sleep_events delete failed: ${res.status} ${await res.text()}`,
      };
    }
    const deleted = parseDeletedCount(res.headers.get("content-range")) ?? 0;
    revalidatePath("/");
    return { ok: true, deleted, cutoff: cutoffIso };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
