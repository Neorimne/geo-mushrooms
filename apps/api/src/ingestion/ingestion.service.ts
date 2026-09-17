import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { randomUUID } from 'node:crypto';
import { City, IngestionRun, Prisma } from '@prisma/client';
import {
  ARCHIVE_PROVIDER,
  ArchiveProvider,
  ArchiveSession,
  ParsedDay,
} from './archive-provider';
import {
  KeyExtractionError,
  PayloadShapeError,
  RateLimitError,
} from './archive.errors';
import { newestArchiveDayUtc } from '@geo/shared/util-archive';
import {
  DAILY_LOOKBACK_DAYS,
  INGESTION_STATUS,
  INGESTION_TRIGGER,
  IngestionTrigger,
  MONTH_REQUEST_DELAY_MS,
  RUN_HEARTBEAT_MS,
  RUN_LEASE_MS,
  RATE_LIMIT_BACKOFF_MS,
  REQUEST_DELAY_MS,
  SEASON_START_MONTH,
} from './ingestion.constants';

/**
 * One city and the months to collect for it. A daily run gives every city a
 * single month; a backfill gives it the whole season. The run's unit — what
 * `totalCities`/`processed` count — is one city-month.
 */
interface CityPlan {
  city: City;
  months: string[]; // 'YYYY-MM-01', ascending
}

/** Stops the run with a message meant for the user, not a stack trace. */
class RunAbortedError extends Error {}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);

  /** The loop of the run currently in flight, so callers can await a run they only started. */
  private inFlight: Promise<void> | null = null;

  /**
   * Identifies this process in the runs it owns. Generated per boot, never
   * reused: a restarted process is a different owner, which is exactly what the
   * reaper needs to know.
   */
  private readonly ownerId = randomUUID();

  /** Refreshes the lease of the run in flight; null when nothing is running. */
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    @Inject(ARCHIVE_PROVIDER) private archive: ArchiveProvider,
  ) {}

  /**
   * Closes runs whose owner stopped proving it was alive.
   *
   * A RUNNING row survives a restart only if the process died mid-run, and
   * nothing is collecting for it any more — but "the process died" is not the
   * same as "a process is booting". This used to mark *every* RUNNING row
   * FAILED unconditionally, so a second instance starting up killed a healthy
   * peer's live collection, and the loop it killed carried on writing counters
   * to a row it no longer owned before flipping it to COMPLETED at the end.
   *
   * The lease is what tells the two apart: a run whose heartbeat is older than
   * `RUN_LEASE_MS` has no live owner, and one that is still being refreshed is
   * someone else's work in progress.
   */
  async onModuleInit() {
    const count = await this.closeExpiredRuns(
      'Interrupted by a server restart',
    );

    if (count > 0) {
      this.logger.warn(`Closed ${count} interrupted collection run(s) from a previous process`);
    }
  }

  /**
   * Closes every RUNNING run whose lease has lapsed, and reports how many.
   *
   * Called on boot and again whenever a new run is refused. Boot alone is not
   * enough: a process that crashes and restarts *inside* the lease window sees
   * a heartbeat that still looks fresh, skips the run, and then never looks
   * again — leaving a run with no living owner holding the lock for good. The
   * lock is only contested when somebody wants it, so that is the other moment
   * worth asking whether it is still genuinely held.
   */
  private async closeExpiredRuns(errorMessage: string): Promise<number> {
    const expiredBefore = new Date(Date.now() - RUN_LEASE_MS);

    const { count } = await this.prisma.ingestionRun.updateMany({
      where: {
        status: INGESTION_STATUS.RUNNING,
        OR: [
          { heartbeatAt: null },
          { heartbeatAt: { lt: expiredBefore } },
        ],
      },
      data: {
        status: INGESTION_STATUS.FAILED,
        errorMessage,
        currentCity: null,
        finishedAt: new Date(),
      },
    });

    return count;
  }

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async handleCron() {
    try {
      await this.startFullRun(INGESTION_TRIGGER.CRON);
      await this.whenIdle();
    } catch (e) {
      this.logger.warn(
        `CRON: skipped — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** Collects the archive's most recent months for every active city. */
  async startFullRun(
    trigger: IngestionTrigger = INGESTION_TRIGGER.MANUAL_ALL,
  ): Promise<IngestionRun> {
    const cities = await this.prisma.city.findMany({
      where: { isActive: true },
    });

    if (cities.length === 0) {
      throw new BadRequestException('There are no active cities to collect');
    }

    return this.beginRun(this.dailyPlans(cities), trigger, 'All cities');
  }

  /**
   * Collects a single city — the current month normally, the whole season when
   * the city has just been created and has no history at all.
   */
  async startCityRun(
    cityId: number,
    trigger: IngestionTrigger = INGESTION_TRIGGER.MANUAL_CITY,
  ): Promise<IngestionRun> {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });

    if (!city) {
      throw new NotFoundException(`City #${cityId} not found`);
    }

    const plans =
      trigger === INGESTION_TRIGGER.CITY_CREATED
        ? this.seasonPlans([city])
        : this.dailyPlans([city]);

    return this.beginRun(plans, trigger, city.name);
  }

  /** Collects the archive's most recent months for one area's cities. */
  async startRegionRun(areaId: number): Promise<IngestionRun> {
    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      include: { cities: { where: { isActive: true } } },
    });

    if (!area) {
      throw new NotFoundException(`Area #${areaId} not found`);
    }
    if (area.cities.length === 0) {
      throw new BadRequestException(
        `Area "${area.name}" has no active cities to collect`,
      );
    }

    return this.beginRun(
      this.dailyPlans(area.cities),
      INGESTION_TRIGGER.MANUAL_REGION,
      area.name,
    );
  }

  /**
   * Seeds the whole current season for every active city. Months already stored
   * in full are skipped without an HTTP call, which is what makes a retry after
   * a rate limit cheap.
   */
  async startBackfillRun(): Promise<IngestionRun> {
    const cities = await this.prisma.city.findMany({
      where: { isActive: true },
    });

    if (cities.length === 0) {
      throw new BadRequestException('There are no active cities to collect');
    }

    const plans = this.seasonPlans(cities);

    return this.beginRun(
      plans,
      INGESTION_TRIGGER.MANUAL_BACKFILL,
      this.seasonLabel(plans[0].months),
    );
  }

  /** The run in flight, or null when nothing is being collected. */
  async getActiveRun(): Promise<IngestionRun | null> {
    return this.prisma.ingestionRun.findFirst({
      where: { status: INGESTION_STATUS.RUNNING },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** The most recent run whatever its status — lets the UI report how the last one ended. */
  async getLatestRun(): Promise<IngestionRun | null> {
    return this.prisma.ingestionRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Resolves once the run in flight (if any) has finished. */
  async whenIdle(): Promise<void> {
    await this.inFlight;
  }

  // --- Run plans -----------------------------------------------------------

  /**
   * The months a daily run covers: those spanned by the last
   * `DAILY_LOOKBACK_DAYS` ending at the newest publishable day. Usually one
   * month, two for the first days of a new one.
   *
   * Anchored on `newestArchiveDay()` rather than yesterday so the plan never
   * asks for a month the source has not begun publishing — on the 2nd and 3rd
   * of a month, yesterday is in the new month while the archive's edge is still
   * in the old one, and asking for the new month returned nothing and counted
   * every city as failed.
   */
  private dailyPlans(cities: City[]): CityPlan[] {
    const last = this.newestArchiveDay();
    const first = new Date(last);
    first.setUTCDate(first.getUTCDate() - DAILY_LOOKBACK_DAYS);

    const months = this.monthsBetween(first, last);
    return cities.map((city) => ({ city, months }));
  }

  /** Every 'YYYY-MM-01' from the month of `from` through the month of `to`. */
  private monthsBetween(from: Date, to: Date): string[] {
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
    );
    const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1);

    const months: string[] = [];
    while (cursor.getTime() <= end) {
      months.push(this.monthOf(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
  }

  /** April through the month holding the newest publishable day, per city. */
  private seasonPlans(cities: City[]): CityPlan[] {
    const months = this.seasonMonths();
    return cities.map((city) => ({ city, months }));
  }

  /**
   * The newest day the archive can possibly hold.
   *
   * Shared with the client rather than computed here: both have to agree on
   * where the archive ends, and they used to agree only by coincidence.
   */
  private newestArchiveDay(): Date {
    return newestArchiveDayUtc();
  }

  /** 'YYYY-MM-01' for the month the date falls in. */
  private monthOf(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  private seasonMonths(): string[] {
    const last = this.newestArchiveDay();
    const year = last.getUTCFullYear();
    const lastMonth = last.getUTCMonth() + 1; // 1-based

    // Out of season (Jan–Mar) there is no range to walk, so a backfill is just
    // the month we could collect anyway — never a no-op.
    if (lastMonth < SEASON_START_MONTH) {
      return [this.monthOf(last)];
    }

    const months: string[] = [];
    for (let m = SEASON_START_MONTH; m <= lastMonth; m++) {
      months.push(`${year}-${String(m).padStart(2, '0')}-01`);
    }
    return months;
  }

  private seasonLabel(months: string[]): string {
    const year = months[0].slice(0, 4);
    const first = MONTHS_SHORT[Number(months[0].slice(5, 7)) - 1];
    const last = MONTHS_SHORT[Number(months[months.length - 1].slice(5, 7)) - 1];
    return months.length === 1
      ? `Season ${year} (${first})`
      : `Season ${year} (${first}–${last})`;
  }

  // --- Run lifecycle -------------------------------------------------------

  /**
   * Keeps this process's claim on a run fresh while its loop is alive.
   *
   * A timer rather than a write inside the loop, because the loop's own pauses
   * are the problem: it sits out `REQUEST_DELAY_MS` between cities and
   * `RATE_LIMIT_BACKOFF_MS` after a rate limit, so heartbeats carried by its
   * counter writes could be more than five minutes apart and honest pacing
   * would read as a dead process.
   *
   * `unref()` so a pending tick never holds the process open at shutdown — the
   * lease is meant to outlive a crash, not to delay an exit. A failed refresh is
   * logged and skipped: one missed tick is well inside `RUN_LEASE_MS`, and
   * killing a healthy run over a transient database error would be the very
   * fault this exists to prevent.
   */
  private startHeartbeat(runId: number) {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      this.prisma.ingestionRun
        .updateMany({
          where: { id: runId, ownerId: this.ownerId },
          data: { heartbeatAt: new Date() },
        })
        .catch((e: unknown) =>
          this.logger.warn(
            `Run #${runId}: heartbeat missed — ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
    }, RUN_HEARTBEAT_MS);

    this.heartbeat.unref?.();
  }

  private stopHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  /**
   * Records the run, then lets the collection loop continue in the background so
   * the caller can respond immediately with the run id.
   */
  private async beginRun(
    plans: CityPlan[],
    trigger: IngestionTrigger,
    scopeLabel: string,
  ): Promise<IngestionRun> {
    const totalUnits = plans.reduce((sum, p) => sum + p.months.length, 0);

    // The insert is the lock. A partial unique index on (status) WHERE
    // status = 'RUNNING' means the database decides who wins, so two callers
    // that arrive together get one run and one 409 rather than two runs.
    //
    // Reading first and then creating cannot do this, whatever the read
    // returns: the read yields the event loop, and the row it did not see may
    // be inserted before the create lands.
    const insert = () =>
      this.prisma.ingestionRun.create({
        data: {
          trigger,
          status: INGESTION_STATUS.RUNNING,
          scopeLabel,
          totalCities: totalUnits,
          ownerId: this.ownerId,
          heartbeatAt: new Date(),
        },
      });

    let run: IngestionRun;
    try {
      run = await insert();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Something holds the lock. It may not still be alive: a process that
      // crashed and restarted inside the lease window left a run the boot
      // reaper skipped, and nothing else would ever reclaim it. This is the
      // moment to check, because it is the moment somebody wants the lock.
      const reclaimed = await this.closeExpiredRuns(
        'Abandoned — the process holding it stopped responding',
      );

      if (reclaimed > 0) {
        this.logger.warn(
          `Reclaimed ${reclaimed} collection run(s) whose lease had expired`,
        );
      }

      try {
        // Exactly one retry. If the insert is refused again the holder is live,
        // or another caller took the lock we just freed — either way the honest
        // answer is that a run is in progress.
        run = reclaimed > 0 ? await insert() : await Promise.reject(error);
      } catch (retryError) {
        if (!isUniqueViolation(retryError)) throw retryError;

        // The active run is re-read only to name it, and may already be over.
        const active = await this.getActiveRun();
        throw new ConflictException(
          `A collection run is already in progress${
            active ? ` (${active.scopeLabel ?? `#${active.id}`})` : ''
          }`,
        );
      }
    }

    this.logger.log(
      `🚀 Run #${run.id} started (${trigger}, ${plans.length} cit${plans.length === 1 ? 'y' : 'ies'} / ${totalUnits} unit(s): ${scopeLabel})`,
    );

    this.startHeartbeat(run.id);
    this.inFlight = this.executeRun(run.id, plans).finally(() => {
      this.stopHeartbeat();
      this.inFlight = null;
    });

    return run;
  }

  /**
   * Walks the units of a run, keeping its counters current as it goes.
   *
   * Three outcomes are deliberately distinguished:
   * - a unit that could not be collected bumps `failed` and the run carries on;
   * - a rate limit is not the unit's fault, so it is retried once and then
   *   aborts the run without blaming any city;
   * - a source that can no longer be handshaked aborts immediately, because
   *   every remaining request would be pointless.
   */
  private async executeRun(runId: number, plans: CityPlan[]): Promise<void> {
    const counters = { processed: 0, failed: 0 };
    let rateLimitHits = 0;

    /**
     * A rate limit costs one polite retry of the same unit; a second one ends
     * the run. Returns true when the caller should try the unit again.
     */
    const absorbRateLimit = async (): Promise<boolean> => {
      rateLimitHits++;
      if (rateLimitHits > 1) {
        throw new RunAbortedError(
          'The source rate-limited the run. Try again later — everything already collected has been saved.',
        );
      }
      this.logger.warn(
        `⏳ Rate-limited — waiting ${RATE_LIMIT_BACKOFF_MS / 60_000} min before one retry`,
      );
      // Minutes of silence look like a hung run, so the wait is put on the
      // progress bar and taken back off again before the retry.
      const resume = await this.announceBackoff(runId);
      await this.delay(RATE_LIMIT_BACKOFF_MS);
      await resume();
      return true;
    };

    try {
      const { session, remaining } = await this.prepareRun(
        runId,
        plans,
        counters,
        absorbRateLimit,
      );

      for (const [cityIndex, plan] of remaining.entries()) {
        let requested = false;

        for (const [monthIndex, month] of plan.months.entries()) {
          await this.setCurrentUnit(runId, this.unitLabel(plan, month));

          // A month already stored in full needs no request at all — this is
          // what makes retrying an interrupted backfill nearly free.
          let monthRequested = false;

          if (await this.isMonthComplete(plan.city.id, month)) {
            this.logger.log(
              `   ⏭️  ${plan.city.name} ${month.slice(0, 7)} already complete — skipped`,
            );
            counters.processed++;
          } else {
            const ok = await this.withRateLimitRetry(
              () => this.processCityMonth(plan.city, month, session),
              absorbRateLimit,
            );
            monthRequested = true;
            requested = true;
            counters[ok ? 'processed' : 'failed']++;
          }

          await this.prisma.ingestionRun.updateMany({
            where: { id: runId, ownerId: this.ownerId },
            data: { processed: counters.processed, failed: counters.failed },
          });

          // Pace the months inside a city, but never idle after the last one —
          // and never for a month that was skipped, since pacing exists to space
          // out requests and a skip makes none.
          if (monthRequested && monthIndex < plan.months.length - 1) {
            await this.delay(MONTH_REQUEST_DELAY_MS);
          }
        }

        // Nothing was requested for this city (every month was already stored),
        // so there is no reason to sit out the inter-city pause.
        if (requested && cityIndex < remaining.length - 1) {
          await this.delay(REQUEST_DELAY_MS);
        }
      }

      // Pinned to the owner, like every terminal write: a run whose lease
      // expired and was reaped is no longer ours to finish, and updateMany
      // simply matches nothing rather than resurrecting a FAILED row as
      // COMPLETED. That resurrection is what made the old unconditional reaper
      // hard to see — the row ended up looking fine.
      await this.prisma.ingestionRun.updateMany({
        where: { id: runId, ownerId: this.ownerId },
        data: {
          status: INGESTION_STATUS.COMPLETED,
          currentCity: null,
          finishedAt: new Date(),
        },
      });
      this.logger.log(
        `✅ Run #${runId} finished — ${counters.processed} collected, ${counters.failed} failed`,
      );
    } catch (error) {
      const message =
        error instanceof KeyExtractionError
          ? 'The source changed shape and can no longer be read — the run was stopped'
          : error instanceof Error
            ? error.message
            : String(error);

      this.logger.error(`❌ Run #${runId} aborted: ${message}`);

      await this.prisma.ingestionRun
        .updateMany({
          where: { id: runId, ownerId: this.ownerId },
          data: {
            status: INGESTION_STATUS.FAILED,
            errorMessage: message,
            currentCity: null,
            finishedAt: new Date(),
          },
        })
        .catch((e) =>
          this.logger.error(`Could not mark run #${runId} as failed:`, e),
        );
    }
  }

  /**
   * Gets the run ready: one handshake against the first city that answers
   * yields the session every later request uses, plus, for free, that city's
   * locality id.
   *
   * Cities that still have no cached id get resolved too. One whose slug the
   * source no longer knows is dropped from the plan and counted failed; the run
   * itself carries on.
   */
  private async prepareRun(
    runId: number,
    plans: CityPlan[],
    counters: { processed: number; failed: number },
    absorbRateLimit: () => Promise<boolean>,
  ): Promise<{ session: ArchiveSession; remaining: CityPlan[] }> {
    let session: ArchiveSession | null = null;
    const remaining: CityPlan[] = [];
    let lastError: unknown = null;

    // The page path shares the data endpoint's rate-limit budget, so these
    // fetches are paced like any other request — including the retries after a
    // city's page fails, which used to go out back to back.
    let requested = false;
    const paceRequest = async () => {
      if (requested) await this.delay(REQUEST_DELAY_MS);
      requested = true;
    };

    for (const plan of plans) {
      // The first city that answers opens the session for the whole run.
      if (!session) {
        try {
          await paceRequest();
          const opened = await this.withRateLimitRetry(
            () => this.archive.openSession(plan.city.slug),
            absorbRateLimit,
          );
          session = opened.session;
          await this.cacheLocalityId(plan.city, opened.localityId);
          remaining.push({ ...plan, city: { ...plan.city, sourceLocalityId: opened.localityId } });
        } catch (error) {
          if (error instanceof KeyExtractionError || error instanceof RunAbortedError) {
            throw error;
          }
          this.logger.warn(
            `Could not open a source session via ${plan.city.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          lastError = error;
          counters.failed += plan.months.length;
        }
        continue;
      }

      if (plan.city.sourceLocalityId !== null) {
        remaining.push(plan);
        continue;
      }

      // A city with no cached id needs its own lookup.
      await paceRequest();
      const localityId = await this.withRateLimitRetry(
        () => this.archive.resolveLocality(plan.city.slug),
        absorbRateLimit,
      );

      if (localityId === null) {
        this.logger.warn(
          `Skipping ${plan.city.name}: the source no longer knows the slug "${plan.city.slug}"`,
        );
        counters.failed += plan.months.length;
        continue;
      }

      await this.cacheLocalityId(plan.city, localityId);
      remaining.push({ ...plan, city: { ...plan.city, sourceLocalityId: localityId } });
    }

    if (!session) {
      throw new RunAbortedError(
        `Could not reach the source for any city${
          lastError instanceof Error ? `: ${lastError.message}` : ''
        }`,
      );
    }

    await this.prisma.ingestionRun.updateMany({
      where: { id: runId, ownerId: this.ownerId },
      data: { processed: counters.processed, failed: counters.failed },
    });

    return { session, remaining };
  }

  /**
   * Puts the rate-limit wait on the progress bar and hands back the undo, so
   * the unit label the run was showing comes back for the retry.
   */
  private async announceBackoff(runId: number): Promise<() => Promise<void>> {
    const before = await this.prisma.ingestionRun
      .findUnique({ where: { id: runId }, select: { currentCity: true } })
      .catch(() => null);

    await this.setCurrentUnit(
      runId,
      `Paused ${RATE_LIMIT_BACKOFF_MS / 60_000} min — the source rate-limited us`,
    );

    return () => this.setCurrentUnit(runId, before?.currentCity ?? null);
  }

  /** The unit the run is working on right now, as the UI shows it. */
  private async setCurrentUnit(
    runId: number,
    currentCity: string | null,
  ): Promise<void> {
    await this.prisma.ingestionRun
      .updateMany({ where: { id: runId, ownerId: this.ownerId }, data: { currentCity } })
      .catch((e) =>
        this.logger.warn(`Could not update the current unit of run #${runId}:`, e),
      );
  }

  /** Runs an operation, absorbing one rate limit before giving up on it. */
  private async withRateLimitRetry<T>(
    operation: () => Promise<T>,
    absorbRateLimit: () => Promise<boolean>,
  ): Promise<T> {
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        if (!(error instanceof RateLimitError)) throw error;
        await absorbRateLimit();
      }
    }
  }

  private async cacheLocalityId(city: City, localityId: number): Promise<void> {
    if (city.sourceLocalityId === localityId) return;

    await this.prisma.city.update({
      where: { id: city.id },
      data: { sourceLocalityId: localityId },
    });
  }

  /**
   * "Pietralta" while a plan holds one month, "Pietralta — 2026-05" once it holds
   * more — a backfill always, and a daily run whose lookback window crosses a
   * month boundary. Naming the month is what makes those runs legible.
   */
  private unitLabel(plan: CityPlan, month: string): string {
    return plan.months.length > 1
      ? `${plan.city.name} — ${month.slice(0, 7)}`
      : plan.city.name;
  }

  // --- Collecting ----------------------------------------------------------

  /**
   * A month strictly in the past never changes again, so a full set of stored
   * days means there is nothing left to ask for. The month holding the
   * archive's edge is always re-fetched: it grows by a day every night.
   */
  private async isMonthComplete(cityId: number, month: string): Promise<boolean> {
    const start = new Date(`${month}T00:00:00.000Z`);
    const next = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );

    // The month holding the archive's edge is still growing, so it is never
    // "complete" however many days are stored.
    const latestCollectable = this.monthOf(this.newestArchiveDay());
    if (month >= latestCollectable) return false;

    const stored = await this.prisma.dailyObservation.count({
      where: { cityId, date: { gte: start, lt: next } },
    });

    const daysInMonth = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();

    return stored >= daysInMonth;
  }

  /**
   * Collects one city-month. Returns false when the month yielded nothing worth
   * storing — a bad month must not abort the run. Rate limits and payload-shape
   * failures are systemic, so they propagate.
   */
  private async processCityMonth(
    city: City,
    month: string,
    session: ArchiveSession,
  ): Promise<boolean> {
    const localityId = city.sourceLocalityId;
    if (localityId === null) return false;

    this.logger.log(`>> ${city.name} ${month.slice(0, 7)}`);

    let days: ParsedDay[];
    try {
      days = await this.archive.fetchMonth(
        session,
        localityId,
        month,
        city.slug,
      );
    } catch (error) {
      // Both of these say something about the source, not about this city.
      if (error instanceof RateLimitError) throw error;
      if (error instanceof KeyExtractionError) throw error;
      if (error instanceof PayloadShapeError) throw error;

      this.logger.error(
        `   ❌ ${city.name} ${month.slice(0, 7)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }

    if (days.length === 0) {
      this.logger.warn(
        `   ⚠️ ${city.name} ${month.slice(0, 7)}: the archive returned no days`,
      );
      return false;
    }

    await this.prisma.$transaction(
      days.map((day) => {
        const data = this.toObservationData(day);
        return this.prisma.dailyObservation.upsert({
          where: {
            cityId_date: {
              cityId: city.id,
              date: new Date(`${day.date}T00:00:00.000Z`),
            },
          },
          create: {
            cityId: city.id,
            date: new Date(`${day.date}T00:00:00.000Z`),
            ...data,
          },
          update: data,
        });
      }),
    );

    this.logger.log(
      `   💾 ${city.name} ${month.slice(0, 7)}: ${days.length} day(s)`,
    );
    return true;
  }

  /** The metric columns, without the identity ones — the same shape on create and update. */
  private toObservationData(
    day: ParsedDay,
  ): Omit<Prisma.DailyObservationCreateInput, 'city' | 'date'> {
    return {
      tMin: day.tMin,
      tMax: day.tMax,
      tPerceived: day.tPerceived,
      precipAmount: day.precipAmount,
      precipUnit: day.precipUnit,
      precipProb: day.precipProb,
      precipType: day.precipType,
      windDirection: day.windDirection,
      windSpeed: day.windSpeed,
      windGust: day.windGust,
      humidity: day.humidity,
      pressure: day.pressure,
      uvIndex: day.uvIndex,
      zeroThermalM: day.zeroThermalM,
      snowLineM: day.snowLineM,
      conditionText: day.conditionText,
      symbolId: day.symbolId,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
