-- getLastUpdate asks for the newest "fetchedAt" on every list load. Without an
-- index that is a sequential scan plus a sort of the largest table, to return a
-- single value; with one it reads the last index entry.
--
-- The cost: "fetchedAt" is @updatedAt, so every upsert now changes an indexed
-- column and can no longer be a HOT update. Writes are a handful of cities per
-- day, so the read wins.

CREATE INDEX "daily_observations_fetchedAt_idx" ON "daily_observations"("fetchedAt");
