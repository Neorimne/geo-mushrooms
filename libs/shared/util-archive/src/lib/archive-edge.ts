/**
 * The archive's edge — the one fact both the backend and the client have to
 * agree on, and the only thing in this library.
 *
 * It is framework-free on purpose. `apps/api` imports it, and a Nest app cannot
 * take an Angular library; putting the number anywhere Angular reaches would
 * force the copy this library exists to delete.
 */

/**
 * Days a daily archive withholds while its most recent readings are validated.
 *
 * A published archive does not run to yesterday: the last readings are held
 * back while they are checked, so the newest day that can possibly exist is
 * D-3. That single number shapes the schema, the run planner and the freshness
 * indicator, and reading it wrong is not a small error — treating the edge as
 * *yesterday* marks every city stale for ever, the same false alarm as treating
 * it as *today*, one step further along.
 */
export const ARCHIVE_VALIDATION_DAYS = 2;

/**
 * The freshest day the archive can hold, as 'YYYY-MM-DD'.
 *
 * Every question of the form "what is the latest we could ask about" has to be
 * asked of this, not of the calendar.
 */
export function newestArchiveDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1 - ARCHIVE_VALIDATION_DAYS,
    ),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * The same day as a UTC `Date`, for the callers that do date arithmetic on it.
 *
 * Built from the ISO form rather than alongside it, so there is one calculation
 * of the edge and not two that have to be kept in step.
 */
export function newestArchiveDayUtc(): Date {
  return new Date(`${newestArchiveDayIso()}T00:00:00.000Z`);
}
