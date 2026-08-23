import { NextResponse } from "next/server";
import {
  authorizeIngest,
  findUserByUsername,
  parseOptionalUuid,
} from "@/lib/ingest";
import { prisma } from "@/lib/prisma";
import { parseDateOnly } from "@/lib/sleep";

const MAX_DAYS = 14;

type DayRow = { day: Date; stepCount: number };

export async function POST(request: Request) {
  const auth = authorizeIngest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected a JSON object." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const user = await findUserByUsername(payload.username ?? payload.user_name);
  if (!user) {
    return NextResponse.json({ error: "Unknown username." }, { status: 404 });
  }

  const sessionId = parseOptionalUuid(payload.sessionId ?? payload.session_id);
  if (sessionId === undefined) {
    return NextResponse.json({ error: "sessionId must be a UUID." }, { status: 400 });
  }

  const days = parseDays(payload);
  if (!days) {
    return NextResponse.json(
      { error: `Send 1–${MAX_DAYS} days with a date and non-negative step count.` },
      { status: 400 },
    );
  }

  const eventTime = new Date();

  await prisma.$transaction(
    days.flatMap((row) => [
      prisma.stepEvent.create({
        data: {
          userId: user.id,
          day: row.day,
          stepCount: row.stepCount,
          eventTime,
          sessionId,
        },
      }),
      prisma.stepNight.upsert({
        where: { userId_night: { userId: user.id, night: row.day } },
        create: {
          userId: user.id,
          night: row.day,
          steps: row.stepCount,
        },
        update: { steps: row.stepCount },
      }),
    ]),
  );

  return NextResponse.json({ ok: true, days: days.length });
}

function parseDays(payload: Record<string, unknown>): DayRow[] | null {
  const rawDays = Array.isArray(payload.days)
    ? payload.days
    : payload.day !== undefined
      ? [payload]
      : null;
  if (!rawDays || rawDays.length === 0 || rawDays.length > MAX_DAYS) {
    return null;
  }

  const days: DayRow[] = [];
  for (const item of rawDays) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const day = parseDateOnly(String(row.day ?? ""));
    const stepCount = parseStepCount(row.stepCount ?? row.step_count ?? row.steps);
    if (!day || stepCount === null) return null;
    days.push({ day, stepCount });
  }
  return days;
}

function parseStepCount(value: unknown): number | null {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 0) return null;
  return count;
}
