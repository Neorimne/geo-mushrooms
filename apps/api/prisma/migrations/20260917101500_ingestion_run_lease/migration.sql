-- A lease on a run, so a restart only closes runs that are actually dead.
--
-- onModuleInit marked EVERY RUNNING row FAILED on boot. With one process that
-- reads as tidy-up; with two it is a live incident, because the second instance
-- to start kills the first one's running collection -- and the loop it killed
-- keeps writing counters to a row it no longer owns, then flips it to COMPLETED
-- at the end.
--
-- `ownerId` says which process holds the run and `heartbeatAt` says when it last
-- proved it was alive, so the reaper can distinguish the two cases.

ALTER TABLE "ingestion_runs" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "ingestion_runs" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

-- Existing rows are historical and already finished; a NULL heartbeat reads as
-- "no lease", which the reaper treats as expired.
