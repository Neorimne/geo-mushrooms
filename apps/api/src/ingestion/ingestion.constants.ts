/** What kicked a collection run off. */
export const INGESTION_TRIGGER = {
  CRON: 'CRON',
  MANUAL_ALL: 'MANUAL_ALL',
  MANUAL_REGION: 'MANUAL_REGION',
  MANUAL_CITY: 'MANUAL_CITY',
  CITY_CREATED: 'CITY_CREATED',

  /** Seeds a whole season at once — many months per city, one request each. */
  MANUAL_BACKFILL: 'MANUAL_BACKFILL',
} as const;

export type IngestionTrigger =
  (typeof INGESTION_TRIGGER)[keyof typeof INGESTION_TRIGGER];

/** Lifecycle of a run. Only one run may be RUNNING at a time. */
export const INGESTION_STATUS = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type IngestionStatus =
  (typeof INGESTION_STATUS)[keyof typeof INGESTION_STATUS];

/**
 * Pause between cities so the source does not rate-limit us. Applied *between*
 * cities only, never after the last one.
 *
 * The source's rate limit is enforced at the CDN edge and scoped to our IP, so
 * every request the whole app makes shares one budget. Slow is the point.
 */
export const REQUEST_DELAY_MS = 45_000;

/**
 * Pause between month requests *within* one city. Shorter than the inter-city
 * gap because a season backfill is six of these back to back, but still far
 * slower than the burst that first tripped the limit during discovery.
 */
export const MONTH_REQUEST_DELAY_MS = 15_000;

/**
 * How long to sit out after the source rate-limits us. Error 1015 expires on
 * its own; the cooldown observed during discovery was well over 15 minutes, so
 * this is a single polite retry, not a way to wait the limit out.
 */
export const RATE_LIMIT_BACKOFF_MS = 5 * 60_000;

/**
 * Days the source withholds while its meteorologists check them.
 *
 * The `/storico` page says so outright — «Ultimi due giorni in validazione: i
 * dati vengono verificati dai nostri meteorologi prima della pubblicazione» —
 * so the newest day that can possibly exist is **D-3**, not D-1. Verified
 * against the live endpoint on 2026-09-07: September held exactly four days,
 * 09-01 to 09-04, with 09-05 and 09-06 still in validation.
 *
 * This number is the whole reason the archive's edge is not "yesterday". It is
 * mirrored on the client in `observation.model.ts`, which cannot import it —
 * change both together.
 */
export const ARCHIVE_VALIDATION_DAYS = 2;

/**
 * How far back of the calendar a *daily* run re-checks, in days.
 *
 * The daily pass used to plan exactly one month — the one containing the newest
 * publishable day — which quietly lost the end of every month. With days
 * arriving three behind, a month's last two days are published *after* the plan
 * has moved on to the next month, and no later daily pass ever asks for them
 * again. August 2026 lost 08-30 and 08-31 exactly this way, with a cron that
 * never missed a run.
 *
 * A window instead of a point costs almost nothing, because a past month
 * already stored in full is skipped with no HTTP call and no pacing: on an
 * ordinary day the second month is one `count` query per city. What it buys is
 * that neither the collection cadence nor the month boundary is load-bearing —
 * the run can be missed, or deliberately made every second or third day.
 *
 * Five days is three to clear the validation lag plus two of slack.
 */
export const DAILY_LOOKBACK_DAYS = 5;

/**
 * First month a season backfill reaches back to (1-based, so 4 = April).
 * Deeper history is one constant away, but the archive is only read for the
 * current foraging season.
 */
export const SEASON_START_MONTH = 4;
