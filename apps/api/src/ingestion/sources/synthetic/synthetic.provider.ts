import { Injectable, Logger } from '@nestjs/common';
import {
  ArchiveProvider,
  ArchiveSession,
  ParsedDay,
} from '../../archive-provider';
import { newestArchiveDayUtc } from '@geo/shared/util-archive';
import { generateDay, hash } from './weather-generator';

export const PROVIDER_ID = 'synthetic';

/**
 * The archive this demo reads. It invents its data instead of calling anyone,
 * which is what lets the repository be cloned and run without an account, a key
 * or a third party's permission.
 *
 * It is a real adapter, not a stub: it honours the same contract, the same
 * archive edge and the same failure vocabulary as a network-backed one, so the
 * ingestion run it drives is the run that would drive a live source. Swapping it
 * for one is the `useClass` line in `ingestion.module.ts`.
 */
@Injectable()
export class SyntheticArchiveProvider implements ArchiveProvider {
  readonly id = PROVIDER_ID;

  private readonly logger = new Logger(SyntheticArchiveProvider.name);

  /**
   * Nothing to hand shake with, so the session is empty — which is the case the
   * opaque `ArchiveSession` exists to make expressible. A source that needs a
   * per-run key puts it here; this one has nothing to put.
   */
  async openSession(
    slug: string,
  ): Promise<{ session: ArchiveSession; localityId: number }> {
    const localityId = await this.resolveLocality(slug);

    if (localityId === null) {
      throw new Error(`Cannot open a session for the unknown slug "${slug}"`);
    }

    return { session: { providerId: PROVIDER_ID }, localityId };
  }

  /**
   * Any well-formed slug is a place this archive knows, and its id is derived
   * from the slug rather than looked up, so the same city keeps the same id
   * across a database reset.
   *
   * A malformed slug still returns null. That path is what `CitiesService`
   * reports as a validation failure, and leaving it unreachable would let a
   * whole branch of the app rot unexercised in the demo.
   */
  async resolveLocality(slug: string): Promise<number | null> {
    if (!/^[a-z0-9]+(?:[-+][a-z0-9]+)*$/.test(slug)) {
      return null;
    }

    return localityIdFor(slug);
  }

  async fetchMonth(
    session: ArchiveSession,
    localityId: number,
    month: string,
    slug = '',
  ): Promise<ParsedDay[]> {
    if (session.providerId !== PROVIDER_ID) {
      throw new Error(
        `Session belongs to "${session.providerId}", not "${PROVIDER_ID}"`,
      );
    }

    this.logger.log(`Generating ${month.slice(0, 7)} for ${slug || localityId}`);

    return monthOfDays(localityId, month);
  }
}

/** A stable numeric id for a slug, standing in for a real archive's locality id. */
export function localityIdFor(slug: string): number {
  return (hash(slug) % 9000) + 1000;
}

/**
 * Towns sit between roughly 500 m and 1500 m, derived from the id so a city's
 * elevation — and therefore its whole temperature series — is stable and
 * differs from its neighbours'.
 */
export function elevationFor(localityId: number): number {
  return 500 + (localityId % 11) * 100;
}

/**
 * Every published day of a month, oldest first.
 *
 * Two edges are enforced here rather than left to the caller. Days after the
 * archive's edge are withheld, because a source that publishes the future is the
 * one thing no real archive does — and the freshness UI reads that edge. Days
 * before the first of the month are not this month's business.
 */
export function monthOfDays(localityId: number, month: string): ParsedDay[] {
  const start = new Date(`${month.slice(0, 7)}-01T00:00:00.000Z`);
  const edge = newestPublishedDay();
  const elevation = elevationFor(localityId);
  const days: ParsedDay[] = [];

  for (
    const cursor = new Date(start);
    cursor.getUTCMonth() === start.getUTCMonth();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (cursor > edge) break;
    const date = cursor.toISOString().slice(0, 10);
    days.push(generateDay(localityId, elevation, date));
  }

  return days;
}

/**
 * The newest day this archive will admit to having: D-3.
 *
 * Real daily archives withhold their most recent days while they are validated,
 * and the app's freshness indicator is built around that lag — a city is current
 * when its latest day is this one, not when it reaches yesterday. Publishing up
 * to yesterday here would make every city read as stale for ever, so the demo
 * honours the same edge the app expects.
 */
export function newestPublishedDay(): Date {
  return newestArchiveDayUtc();
}
