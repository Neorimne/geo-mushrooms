/**
 * The seam between the ingestion run and whatever supplies the daily archive.
 *
 * Everything a run does — planning city-months, pacing, the single-flight lock,
 * idempotent upserts, per-unit error isolation — is independent of where the
 * days come from. This interface is the whole of what it needs from a source,
 * so a second source is a second adapter rather than a second run loop.
 */

/**
 * One observed day, with every value already normalised to the type the DB
 * column expects. Sources mix numbers, numeric strings and unit-suffixed
 * strings freely; nothing past a provider should ever see that.
 *
 * Field names mirror `DailyObservation` so a parsed day can be written as-is.
 */
export interface ParsedDay {
  date: string; // 'YYYY-MM-DD'
  tMin: number | null;
  tMax: number | null;
  tPerceived: number | null;
  precipAmount: number | null;
  precipUnit: string | null;
  precipProb: number | null;
  precipType: string | null;
  windDirection: string | null;
  /** Knots, as sources send it — never km/h. Converted at the point of display. */
  windSpeed: number | null;
  /** Knots. */
  windGust: number | null;
  humidity: number | null;
  pressure: number | null;
  uvIndex: number | null;
  zeroThermalM: number | null;
  snowLineM: number | null;
  conditionText: string | null;
  symbolId: number | null;
}

/** DI token for the active adapter. Injected rather than the class, so the app can be built against any source. */
export const ARCHIVE_PROVIDER = Symbol('ARCHIVE_PROVIDER');

/**
 * Whatever a provider needs to hold for the length of one run, opaque to the
 * run itself.
 *
 * A source that authenticates per run — one that reads a rotating key out of a
 * page, say — keeps it here. Threading such a value through the run loop as a
 * bare `string` would put one source's implementation detail in the signature of
 * every collection step, and leave a source without a handshake nothing honest
 * to pass. Anything source-specific belongs behind this type.
 */
export interface ArchiveSession {
  /** Names the provider that opened it, so a mismatched session fails loudly. */
  readonly providerId: string;
}

export interface ArchiveProvider {
  /** Identifies the adapter in logs and in the sessions it hands out. */
  readonly id: string;

  /**
   * Per-run handshake, performed against one city's page. Returns the session
   * every later call in the run passes back, plus that city's locality id,
   * which the handshake yields for free.
   *
   * A provider with no handshake still implements this — it just returns an
   * empty session and resolves the locality directly.
   */
  openSession(
    slug: string,
  ): Promise<{ session: ArchiveSession; localityId: number }>;

  /**
   * Maps a slug to the provider's own numeric id, cached on the city.
   *
   * `null` means "this source does not know that slug" — a user error, not a
   * fault. Rate limits and transport failures throw, because they say nothing
   * about the slug.
   */
  resolveLocality(slug: string): Promise<number | null>;

  /**
   * One whole month of days, already normalised. `month` is any 'YYYY-MM-DD'
   * inside the wanted month.
   *
   * Returning `ParsedDay[]` rather than a raw payload is what keeps parsing a
   * provider concern: the run persists what it is given and never learns the
   * shape any particular source sends.
   */
  fetchMonth(
    session: ArchiveSession,
    localityId: number,
    month: string,
    slug: string,
  ): Promise<ParsedDay[]>;
}
