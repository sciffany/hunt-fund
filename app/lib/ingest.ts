import { timingSafeEqual } from "node:crypto";
import { SleepEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeUsername } from "@/lib/username";

const SLEEP_EVENT_TYPES: Record<string, SleepEventType> = {
  app_start: "APP_START",
  activity: "ACTIVITY",
  app_close: "APP_CLOSE",
  phone_activity: "PHONE_ACTIVITY",
  phone_session_start: "PHONE_SESSION_START",
  phone_session_end: "PHONE_SESSION_END",
  system_shutdown: "SYSTEM_SHUTDOWN",
  APP_START: "APP_START",
  ACTIVITY: "ACTIVITY",
  APP_CLOSE: "APP_CLOSE",
  PHONE_ACTIVITY: "PHONE_ACTIVITY",
  PHONE_SESSION_START: "PHONE_SESSION_START",
  PHONE_SESSION_END: "PHONE_SESSION_END",
  SYSTEM_SHUTDOWN: "SYSTEM_SHUTDOWN",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IngestAuth =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function authorizeIngest(request: Request): IngestAuth {
  const expected = process.env.INGEST_TOKEN?.trim() ?? "";
  if (!expected) {
    return { ok: false, status: 503, error: "Ingest is not configured." };
  }

  const provided = bearerToken(request.headers.get("authorization"));
  if (!provided || !tokensEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid ingest token." };
  }
  return { ok: true };
}

export function parseSleepEventType(value: unknown): SleepEventType | null {
  if (typeof value !== "string") return null;
  return SLEEP_EVENT_TYPES[value] ?? null;
}

export function parseOptionalUuid(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) return undefined;
  return value.trim();
}

export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function findUserByUsername(raw: unknown) {
  if (typeof raw !== "string") return null;
  const username = normalizeUsername(raw);
  if (!username) return null;
  return prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
