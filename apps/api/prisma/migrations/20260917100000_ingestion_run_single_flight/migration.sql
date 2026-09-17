-- Make the single-flight rule a constraint instead of a convention.
--
-- IngestionService checked for an active run and then created one. Those are
-- two statements, so two callers could both read "nothing running" and both
-- insert -- reachable in ordinary operation, because CitiesService starts a run
-- without awaiting it from a request handler while the cron fires on its own
-- timer. Only the database can settle this, so it does.
--
-- Prisma cannot express a partial index in schema.prisma, so this is written by
-- hand and the schema carries a comment pointing here. `prisma migrate` leaves
-- it alone: it is not representable in the model, so it is never diffed away.

-- Any rows left RUNNING by an older process would make the index fail to build.
-- They are already dead -- nothing has been collecting for them since that
-- process exited -- so close them out the way the startup reaper would.
UPDATE "ingestion_runs"
SET "status" = 'FAILED',
    "errorMessage" = 'Interrupted by a server restart',
    "currentCity" = NULL,
    "finishedAt" = NOW()
WHERE "status" = 'RUNNING';

-- The lock itself: at most one row may be RUNNING, across every process that
-- shares this database. A second insert now fails with P2002.
CREATE UNIQUE INDEX "ingestion_runs_single_running"
  ON "ingestion_runs" ("status")
  WHERE "status" = 'RUNNING';
