import { NextResponse } from "next/server";
import { SleepEventType } from "@prisma/client";
import {
  authorizeIngest,
  findUserByUsername,
  parseIsoDate,
  parseOptionalUuid,
  parseSleepEventType,
} from "@/lib/ingest";
import { prisma } from "@/lib/prisma";

const MAX_BATCH_EVENTS = 500;
const PHONE_SESSION_TYPES: SleepEventType[] = [
  "PHONE_SESSION_START",
  "PHONE_SESSION_END",
];

type EventRow = { eventType: SleepEventType; eventTime: Date };

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

  if (Array.isArray(payload.events)) {
    return ingestPhoneSessionBatch(user.id, sessionId, payload);
  }

  const eventType = parseSleepEventType(
    payload.eventType ?? payload.event_type,
  );
  if (!eventType) {
    return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
  }

  const eventTime = parseIsoDate(payload.eventTime ?? payload.event_time);
  if (!eventTime) {
    return NextResponse.json({ error: "Enter a valid event time." }, { status: 400 });
  }

  const event = await prisma.sleepEvent.create({
    data: {
      userId: user.id,
      eventType,
      eventTime,
      sessionId,
    },
    select: { id: true, eventType: true },
  });

  return NextResponse.json({ ok: true, id: event.id, eventType: event.eventType });
}

async function ingestPhoneSessionBatch(
  userId: string,
  sessionId: string | null,
  payload: Record<string, unknown>,
) {
  const rawEvents = payload.events;
  if (!Array.isArray(rawEvents) || rawEvents.length > MAX_BATCH_EVENTS) {
    return NextResponse.json(
      { error: `Send 0–${MAX_BATCH_EVENTS} phone session events.` },
      { status: 400 },
    );
  }

  const events: EventRow[] = [];
  for (const item of rawEvents) {
    if (!item || typeof item !== "object") {
      return NextResponse.json({ error: "Each event must be an object." }, { status: 400 });
    }
    const row = item as Record<string, unknown>;
    const eventType = parseSleepEventType(row.eventType ?? row.event_type);
    if (!eventType || !isPhoneSessionType(eventType)) {
      return NextResponse.json(
        { error: "Batch events must be PHONE_SESSION_START or PHONE_SESSION_END." },
        { status: 400 },
      );
    }
    const eventTime = parseIsoDate(row.eventTime ?? row.event_time);
    if (!eventTime) {
      return NextResponse.json({ error: "Each event needs a valid event time." }, { status: 400 });
    }
    events.push({ eventType, eventTime });
  }

  const replaceFrom = parseIsoDate(payload.replaceFrom ?? payload.replace_from);
  const replaceTo = parseIsoDate(payload.replaceTo ?? payload.replace_to);
  if (!replaceFrom || !replaceTo || replaceFrom.getTime() > replaceTo.getTime()) {
    return NextResponse.json(
      { error: "replaceFrom and replaceTo must be a valid time range." },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.sleepEvent.deleteMany({
      where: {
        userId,
        eventType: { in: PHONE_SESSION_TYPES },
        eventTime: { gte: replaceFrom, lte: replaceTo },
      },
    });
    if (events.length === 0) return;
    await tx.sleepEvent.createMany({
      data: events.map((event) => ({
        userId,
        eventType: event.eventType,
        eventTime: event.eventTime,
        sessionId,
      })),
    });
  });

  return NextResponse.json({ ok: true, events: events.length });
}

function isPhoneSessionType(value: SleepEventType): boolean {
  return value === "PHONE_SESSION_START" || value === "PHONE_SESSION_END";
}
