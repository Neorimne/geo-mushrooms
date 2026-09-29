/**
 * Failures the source can hand us, split by what the run should do about them.
 * They are deliberately distinct classes rather than status codes: the run loop
 * reacts very differently to "slow down" than to "the source changed shape".
 */

/**
 * The source answered, but what a provider reads from it to open a session —
 * a per-run key, a locality id — is no longer there. A handshake can change
 * under a provider without notice; when it does, this is the loud alarm that
 * stops the run, instead of a silent month of zero rows.
 */
export class KeyExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyExtractionError';
  }
}

/**
 * The source is refusing requests for arriving too fast. It expires on its
 * own — a pause, not a ban. Back off and retry; never count it as a city that
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
 * The archive answered, but not in the shape the provider knows how to read.
 * Systemic rather than per-day, so it aborts the run.
 */
export class PayloadShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadShapeError';
  }
}
