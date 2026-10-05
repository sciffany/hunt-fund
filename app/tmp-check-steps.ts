import fs from "node:fs";
import { selectSheetStepDays, stepSheetWindowStart } from "./lib/step-sheets";

const csv = fs.readFileSync("/tmp/sheet.csv", "utf8");
const today = "2026-10-05";
const days = selectSheetStepDays(csv, today);
const byDate = Object.fromEntries(days.map((day) => [day.date, day.steps]));
const start = stepSheetWindowStart(today);

if (start !== "2026-09-05") throw new Error(`bad start ${start}`);
if (byDate["2026-09-04"] !== undefined) throw new Error("sep 4 included");
if (byDate["2026-09-05"] !== 12350) throw new Error(`sep 5 ${byDate["2026-09-05"]}`);
if (byDate["2026-09-30"] !== 5141) throw new Error(`sep 30 ${byDate["2026-09-30"]}`);
if (byDate["2026-10-04"] !== 12415) throw new Error(`oct 4 ${byDate["2026-10-04"]}`);
if (byDate["2026-10-05"] !== undefined) throw new Error("blank today written");
if (days[0]?.date !== "2026-09-05" || days.at(-1)?.date !== "2026-10-04") {
  throw new Error(`range ${days[0]?.date}..${days.at(-1)?.date}`);
}
if (days.length !== 30) throw new Error(`count ${days.length}`);

const leap = stepSheetWindowStart("2024-03-31");
if (leap !== "2024-02-29") throw new Error(`leap ${leap}`);

console.log(`ok ${days.length} days ${start} through ${today}`);
