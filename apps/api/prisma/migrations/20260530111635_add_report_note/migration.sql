-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notes_reportId_key" ON "notes"("reportId");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
