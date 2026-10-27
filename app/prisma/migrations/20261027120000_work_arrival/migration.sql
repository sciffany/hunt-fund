-- AlterEnum
ALTER TYPE "TrackingKind" ADD VALUE 'WORK_ARRIVAL_TIME';

-- CreateTable
CREATE TABLE "WorkArrivalDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDay" DATE NOT NULL,
    "arrivedAt" TIMESTAMP(3),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkArrivalDay_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkArrivalDay_check_in_pair_check" CHECK (
        (
            "arrivedAt" IS NULL
            AND "latitude" IS NULL
            AND "longitude" IS NULL
        )
        OR (
            "arrivedAt" IS NOT NULL
            AND "latitude" IS NOT NULL
            AND "longitude" IS NOT NULL
        )
    )
);

-- CreateTable
CREATE TABLE "WorkArrivalTarget" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "arrivalMinutes" INTEGER NOT NULL,
    "days" JSONB NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "radiusMeters" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkArrivalTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkArrivalOverride" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "arrivalMinutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkArrivalOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkArrivalPenalty" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "unit" "PenaltyUnit" NOT NULL,
    "unitLabel" TEXT,
    "blockMinutes" INTEGER NOT NULL DEFAULT 10,
    "cap" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkArrivalPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkArrivalDay_userId_workDay_key" ON "WorkArrivalDay"("userId", "workDay");

-- CreateIndex
CREATE INDEX "WorkArrivalDay_workDay_idx" ON "WorkArrivalDay"("workDay" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkArrivalTarget_groupMemberId_effectiveFrom_key" ON "WorkArrivalTarget"("groupMemberId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "WorkArrivalOverride_groupMemberId_date_key" ON "WorkArrivalOverride"("groupMemberId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkArrivalPenalty_groupMemberId_effectiveFrom_key" ON "WorkArrivalPenalty"("groupMemberId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "WorkArrivalDay" ADD CONSTRAINT "WorkArrivalDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArrivalTarget" ADD CONSTRAINT "WorkArrivalTarget_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArrivalOverride" ADD CONSTRAINT "WorkArrivalOverride_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkArrivalPenalty" ADD CONSTRAINT "WorkArrivalPenalty_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
