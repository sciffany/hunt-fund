import { NextResponse } from "next/server";
import {
  authorizeIngest,
  findUserByUsername,
  parseIsoDate,
  parseOptionalUuid,
  parseSleepEventType,
} from "@/lib/ingest";
import { prisma } from "@/lib/prisma";

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

  const sessionId = parseOptionalUuid(payload.sessionId ?? payload.session_id);
  if (sessionId === undefined) {
    return NextResponse.json({ error: "sessionId must be a UUID." }, { status: 400 });
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
