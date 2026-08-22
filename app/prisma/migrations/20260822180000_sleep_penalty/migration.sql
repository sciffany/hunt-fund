-- CreateEnum
CREATE TYPE "PenaltyUnit" AS ENUM ('MONEY', 'CHORE', 'OTHER');

-- CreateTable
CREATE TABLE "SleepPenalty" (
    "id" TEXT NOT NULL,
    "groupMemberId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "unit" "PenaltyUnit" NOT NULL,
    "unitLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleepPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SleepPenalty_groupMemberId_effectiveFrom_key" ON "SleepPenalty"("groupMemberId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "SleepPenalty" ADD CONSTRAINT "SleepPenalty_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
