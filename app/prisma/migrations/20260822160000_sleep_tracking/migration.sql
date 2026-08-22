-- CreateEnum
CREATE TYPE "TrackingKind" AS ENUM ('SLEEP_TIME_GADGET_USAGE');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "trackingKinds" "TrackingKind"[] DEFAULT ARRAY[]::"TrackingKind"[];

-- CreateTable
CREATE TABLE "SleepSchedule" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "times" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleepSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepOverride" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "halfHoursPast8pm" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleepOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SleepSchedule_groupMemberId_effectiveFrom_key" ON "SleepSchedule"("groupMemberId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SleepOverride_groupMemberId_date_key" ON "SleepOverride"("groupMemberId", "date");

-- AddForeignKey
ALTER TABLE "SleepSchedule" ADD CONSTRAINT "SleepSchedule_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepOverride" ADD CONSTRAINT "SleepOverride_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
