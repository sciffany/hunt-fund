-- When true, the day is exempt from tracking and penalties (e.g., sick leave).
ALTER TABLE "WorkArrivalOverride"
ADD COLUMN "exempt" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WorkArrivalOverride_exempt_idx" ON "WorkArrivalOverride"("exempt");
