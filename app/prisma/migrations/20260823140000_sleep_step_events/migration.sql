-- CreateEnum
CREATE TYPE "SleepEventType" AS ENUM ('APP_START', 'ACTIVITY', 'APP_CLOSE', 'PHONE_ACTIVITY');

-- CreateTable
CREATE TABLE "SleepEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "SleepEventType" NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepNight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "night" DATE NOT NULL,
    "lastActivity" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SleepNight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "stepCount" INTEGER NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepNight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "night" DATE NOT NULL,
    "steps" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepNight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SleepEvent_userId_eventTime_idx" ON "SleepEvent"("userId", "eventTime" DESC);

-- CreateIndex
CREATE INDEX "SleepEvent_eventType_eventTime_idx" ON "SleepEvent"("eventType", "eventTime" DESC);

-- CreateIndex
CREATE INDEX "SleepNight_night_idx" ON "SleepNight"("night" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SleepNight_userId_night_key" ON "SleepNight"("userId", "night");

-- CreateIndex
CREATE INDEX "StepEvent_userId_day_idx" ON "StepEvent"("userId", "day" DESC);

-- CreateIndex
CREATE INDEX "StepNight_night_idx" ON "StepNight"("night" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StepNight_userId_night_key" ON "StepNight"("userId", "night");

-- AddForeignKey
ALTER TABLE "SleepEvent" ADD CONSTRAINT "SleepEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepNight" ADD CONSTRAINT "SleepNight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepEvent" ADD CONSTRAINT "StepEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepNight" ADD CONSTRAINT "StepNight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
