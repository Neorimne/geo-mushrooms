/** Default trailing window for the list view's per-city sparkline. */
export const DEFAULT_SUMMARY_DAYS = 14;

/**
 * Longest window the detail endpoint will read. A little over a year, so a
 * full season plus its edges fits, while a mistyped `from` cannot ask the DB
 * to walk every row it has.
 */
export const MAX_RANGE_DAYS = 370;
