-- AlterEnum
ALTER TYPE "TrackingKind" ADD VALUE 'DAILY_STEPS';

-- CreateTable
CREATE TABLE "StepTarget" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "targetSteps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepPenalty" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "unit" "PenaltyUnit" NOT NULL,
    "unitLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StepTarget_groupMemberId_effectiveFrom_key" ON "StepTarget"("groupMemberId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StepPenalty_groupMemberId_effectiveFrom_key" ON "StepPenalty"("groupMemberId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "StepTarget" ADD CONSTRAINT "StepTarget_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepPenalty" ADD CONSTRAINT "StepPenalty_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
