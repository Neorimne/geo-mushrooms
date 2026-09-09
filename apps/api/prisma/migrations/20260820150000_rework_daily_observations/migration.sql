-- Rework: the mushroom forecast is replaced by the source's daily historical archive.
--
-- This migration DROPS POPULATED TABLES. `daily_reports`, `mushroom_analytics`
-- and `hourly_weather` hold the disproven mushroom signal and unit-baked string
-- weather, none of which can be carried over; `notes` hung off `daily_reports`
-- and is recreated against `daily_observations` instead. Dropping the existing
-- notes is a deliberate, confirmed decision — take a `pg_dump` before deploying
-- this anywhere with data worth keeping.

-- DropForeignKey
ALTER TABLE "daily_reports" DROP CONSTRAINT "daily_reports_cityId_fkey";

-- DropForeignKey
ALTER TABLE "hourly_weather" DROP CONSTRAINT "hourly_weather_reportId_fkey";

-- DropForeignKey
ALTER TABLE "mushroom_analytics" DROP CONSTRAINT "mushroom_analytics_reportId_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_reportId_fkey";

-- DropTable
-- Recreated below against `daily_observations`. Dropping rather than altering:
-- every row points at a `daily_reports` id that is about to stop existing, so
-- there is nothing a NOT NULL `observationId` could be back-filled from.
DROP TABLE "notes";

-- DropTable
DROP TABLE "hourly_weather";

-- DropTable
DROP TABLE "mushroom_analytics";

-- DropTable
DROP TABLE "daily_reports";

-- AlterTable
ALTER TABLE "cities" ADD COLUMN     "sourceLocalityId" INTEGER;

-- CreateTable
CREATE TABLE "daily_observations" (
    "id" SERIAL NOT NULL,
    "cityId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "tMin" DOUBLE PRECISION,
    "tMax" DOUBLE PRECISION,
    "tPerceived" DOUBLE PRECISION,
    "precipAmount" DOUBLE PRECISION,
    "precipUnit" TEXT,
    "precipProb" INTEGER,
    "precipType" TEXT,
    "windDirection" TEXT,
    "windSpeed" DOUBLE PRECISION,
    "windGust" DOUBLE PRECISION,
    "humidity" INTEGER,
    "pressure" DOUBLE PRECISION,
    "uvIndex" DOUBLE PRECISION,
    "zeroThermalM" INTEGER,
    "snowLineM" INTEGER,
    "conditionText" TEXT,
    "symbolId" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "observationId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_observations_cityId_date_key" ON "daily_observations"("cityId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "notes_observationId_key" ON "notes"("observationId");

-- AddForeignKey
ALTER TABLE "daily_observations" ADD CONSTRAINT "daily_observations_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "daily_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
