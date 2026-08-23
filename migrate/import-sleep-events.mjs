import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";

const require = createRequire(new URL("../app/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

const USER_IDS = {
  tiffany: "cmt5h667s0000yan008v88g8e",
  sophia: "cmt5hjvwp0009yan0tm1jc81h",
  yipin: "cmt5hk27u000cyan05dk24ufl",
};

const EVENT_TYPES = {
  app_start: "APP_START",
  activity: "ACTIVITY",
  app_close: "APP_CLOSE",
  phone_activity: "PHONE_ACTIVITY",
};

const CSV_PATH = new URL("./sleep_events.csv", import.meta.url);

function parseTimestamp(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return date;
}

function parseCsvLine(line) {
  return line.split(",");
}

async function readRows() {
  const rows = [];
  const skipped = [];
  const rl = createInterface({ input: createReadStream(CSV_PATH) });
  let header = true;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (header) {
      header = false;
      continue;
    }
    const [legacyId, userName, eventType, eventTime, sessionId, createdAt] =
      parseCsvLine(line);
    const userId = USER_IDS[userName];
    if (!userId) {
      skipped.push(userName);
      continue;
    }
    const mappedType = EVENT_TYPES[eventType];
    if (!mappedType) {
      throw new Error(`Unknown event_type: ${eventType}`);
    }
    rows.push({
      id: `legacy-sleep-${legacyId.trim()}`,
      userName,
      userId,
      eventType: mappedType,
      eventTime: parseTimestamp(eventTime),
      sessionId: sessionId.trim() || null,
      createdAt: parseTimestamp(createdAt),
    });
  }
  return { rows, skipped };
}

const prisma = new PrismaClient();

const { rows, skipped } = await readRows();
const ids = [...new Set(rows.map((row) => row.userId))];
const users = await prisma.user.findMany({
  where: { id: { in: ids } },
  select: { id: true, username: true, displayName: true, name: true },
});

if (users.length !== ids.length) {
  const found = new Set(users.map((user) => user.id));
  const missing = ids.filter((id) => !found.has(id));
  throw new Error(`Users not found: ${missing.join(", ")}`);
}

const missingTime = rows.find((row) => !row.eventTime || !row.createdAt);
if (missingTime) {
  throw new Error(`Missing timestamp for ${missingTime.id}`);
}

const result = await prisma.sleepEvent.createMany({
  data: rows.map(({ userName: _userName, ...row }) => row),
  skipDuplicates: true,
});

const counts = rows.reduce((acc, row) => {
  acc[row.userName] = (acc[row.userName] ?? 0) + 1;
  return acc;
}, {});

console.log(
  JSON.stringify(
    {
      inserted: result.count,
      read: rows.length,
      byUser: counts,
      skipped,
      users,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
