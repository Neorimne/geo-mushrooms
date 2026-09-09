/**
 * Failures the source can hand us, split by what the run should do about them.
 * They are deliberately distinct classes rather than status codes: the run loop
 * reacts very differently to "slow down" than to "the page changed shape".
 */

/**
 * The `/storico` page loaded but no longer contains the obfuscation key or the
 * locality id. The key is versioned and *will* rotate — when it does, this is
 * the loud alarm that stops the run, instead of a silent month of zero rows.
 */
export class KeyExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyExtractionError';
  }
}

/**
 * Cloudflare edge rate limiting (HTTP 429, error 1015). IP-scoped and
 * self-expiring — not a ban. Back off and retry; never count it as a city that
 * failed to collect.
 */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/** Any other unhappy response from the source. */
export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SourceHttpError';
  }
}

/**
 * The archive answered, but not with the free-tier envelope we know how to
 * read. Systemic rather than per-day, so it aborts the run.
 */
export class PayloadShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadShapeError';
  }
}
