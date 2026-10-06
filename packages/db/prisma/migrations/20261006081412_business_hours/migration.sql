-- AlterTable
ALTER TABLE "SlaPolicy" ADD COLUMN     "scheduleId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "slaBusinessHours" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BusinessSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "intervals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSchedule_name_key" ON "BusinessSchedule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_scheduleId_date_key" ON "Holiday"("scheduleId", "date");

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BusinessSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BusinessSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
