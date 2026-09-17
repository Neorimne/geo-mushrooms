import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { City, Prisma } from '@prisma/client';
import { IngestionService } from './ingestion.service';
import {
  ARCHIVE_PROVIDER,
  ArchiveSession,
  ParsedDay,
} from './archive-provider';
import { PrismaService } from '../prisma/prisma.service';
import {
  INGESTION_STATUS,
  INGESTION_TRIGGER,
  MONTH_REQUEST_DELAY_MS,
  RUN_HEARTBEAT_MS,
  RUN_LEASE_MS,
  RATE_LIMIT_BACKOFF_MS,
  REQUEST_DELAY_MS,
} from './ingestion.constants';
import { KeyExtractionError, RateLimitError } from './archive.errors';

/** The subset of `ingestion_runs` the service reads back. */
type RunRow = {
  id: number;
  trigger: string;
  status: string;
  scopeLabel: string | null;
  totalCities: number;
  processed: number;
  failed: number;
  currentCity: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  ownerId: string | null;
  heartbeatAt: Date | null;
};

/** The subset of `where` the service actually uses against ingestion_runs. */
type RunWhere = {
  id?: number;
  status?: string;
  ownerId?: string;
  OR?: { heartbeatAt: null | { lt: Date } }[];
};

/** Matches a row the way Prisma would, so updateMany can be filtered honestly. */
function matches(run: RunRow, where: RunWhere = {}): boolean {
  if (where.id !== undefined && run.id !== where.id) return false;
  if (where.status !== undefined && run.status !== where.status) return false;
  if (where.ownerId !== undefined && run.ownerId !== where.ownerId) return false;
  if (where.OR) {
    const any = where.OR.some((clause) =>
      clause.heartbeatAt === null
        ? run.heartbeatAt === null
        : run.heartbeatAt !== null && run.heartbeatAt < clause.heartbeatAt.lt,
    );
    if (!any) return false;
  }
  return true;
}

const city = (
  id: number,
  name: string,
  sourceLocalityId: number | null = 100 + id,
): City => ({
  id,
  name,
  slug: name.toLowerCase(),
  areaId: 1,
  isActive: true,
  sourceLocalityId,
  createdAt: new Date(),
});

/**
 * The days a provider hands back for a month. Normalising is the provider's
 * job, so these are already `ParsedDay`s — the run under test never sees a
 * source payload.
 */
function monthDays(...dates: string[]): ParsedDay[] {
  return dates.map((date) => ({
    date,
    tMin: 4,
    tMax: 14,
    tPerceived: null,
    precipAmount: 0,
    precipUnit: 'mm',
    precipProb: null,
    precipType: null,
    windDirection: null,
    windSpeed: null,
    windGust: null,
    humidity: null,
    pressure: null,
    uvIndex: null,
    zeroThermalM: null,
    snowLineM: null,
    conditionText: null,
    symbolId: null,
  }));
}

/** Every day of the given 'YYYY-MM' — what a fully covered past month looks like. */
function fullMonth(month: string): ParsedDay[] {
  const [year, mon] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return monthDays(
    ...Array.from(
      { length: days },
      (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
    ),
  );
}

/** The session the fake provider hands out, and expects back on every call. */
const SESSION: ArchiveSession = { providerId: 'test' };

/**
 * Mid-month, so a daily plan spans exactly one month and these tests stay about
 * the run's mechanics. Without a pinned clock they inherit the real date, and
 * the unit counts change on their own near a month boundary.
 */
const MID_MONTH = new Date('2026-08-20T09:00:00.000Z');

describe('IngestionService', () => {
  let service: IngestionService;
  let runs: RunRow[];
  let prismaService: {
    city: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    area: { findUnique: jest.Mock };
    dailyObservation: { count: jest.Mock; upsert: jest.Mock };
    ingestionRun: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let archive: {
    id: string;
    openSession: jest.Mock;
    resolveLocality: jest.Mock;
    fetchMonth: jest.Mock;
  };

  beforeEach(async () => {
    runs = [];

    prismaService = {
      city: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(null),
      },
      area: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      dailyObservation: {
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
      },
      // A small in-memory stand-in, so counters can be asserted as the run progresses.
      ingestionRun: {
        create: jest.fn(({ data }: { data: Partial<RunRow> }) => {
          // Models the partial unique index on (status) WHERE status = 'RUNNING'.
          // Without this the double would accept a second RUNNING row that the
          // real database refuses, and every lock test would pass by default.
          if (
            data.status === INGESTION_STATUS.RUNNING &&
            runs.some((r) => r.status === INGESTION_STATUS.RUNNING)
          ) {
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the fields: (`status`)',
                {
                  code: 'P2002',
                  clientVersion: 'test',
                  meta: { target: 'ingestion_runs_single_running' },
                },
              ),
            );
          }

          const run: RunRow = {
            id: runs.length + 1,
            trigger: '',
            status: '',
            scopeLabel: null,
            totalCities: 0,
            processed: 0,
            failed: 0,
            currentCity: null,
            errorMessage: null,
            startedAt: new Date(),
            finishedAt: null,
            ownerId: null,
            heartbeatAt: null,
            ...data,
          };
          runs.push(run);
          return Promise.resolve(run);
        }),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: number };
            data: Partial<RunRow>;
          }) => {
            const run = runs.find((r) => r.id === where.id);
            if (run) Object.assign(run, data);
            return Promise.resolve(run);
          },
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where?: RunWhere;
            data: Partial<RunRow>;
          }) => {
            const matched = runs.filter((r) => matches(r, where));
            matched.forEach((r) => Object.assign(r, data));
            return Promise.resolve({ count: matched.length });
          },
        ),
        findUnique: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(runs.find((r) => r.id === where.id) ?? null),
        ),
        findFirst: jest.fn(
          ({ where }: { where?: { status?: string } } = {}) => {
            const newestFirst = [...runs].reverse();
            const match = where?.status
              ? newestFirst.find((r) => r.status === where.status)
              : newestFirst[0];
            return Promise.resolve(match ?? null);
          },
        ),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    archive = {
      id: 'test',
      // The handshake runs against one city's slug and is the authority on that
      // city's id, so the default answer is the first city's own id (101).
      openSession: jest
        .fn()
        .mockResolvedValue({ localityId: 101, session: SESSION }),
      resolveLocality: jest.fn().mockResolvedValue(2087),
      fetchMonth: jest.fn().mockResolvedValue(monthDays('2026-08-01')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ARCHIVE_PROVIDER, useValue: archive },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Collection runs', () => {
    it('records a run and closes it once every city is done', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(MID_MONTH);
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);

      const run = await service.startFullRun();
      expect(run.status).toBe(INGESTION_STATUS.RUNNING);
      expect(run.totalCities).toBe(2);

      // The pause between cities is the only thing keeping the run open.
      await jest.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
      await service.whenIdle();

      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 2,
        failed: 0,
        currentCity: null,
      });
      expect(runs[0].finishedAt).not.toBeNull();
    });

    it('counts a city that could not be collected without aborting the run', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(MID_MONTH);
      archive.fetchMonth.mockImplementation(
        (_session: ArchiveSession, localityId: number) =>
          localityId === 101
            ? Promise.reject(new Error('502 Bad Gateway'))
            : Promise.resolve(monthDays('2026-08-01')),
      );
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Broken'),
        city(2, 'Beta'),
      ]);

      await service.startFullRun();
      await jest.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
      await service.whenIdle();

      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 1,
        failed: 1,
      });
    });

    it('does not pause after the last city', async () => {
      // Fake timers only to pin the date: a one-unit run has no pause to wait
      // out, which is the whole point of the test.
      jest.useFakeTimers();
      jest.setSystemTime(MID_MONTH);
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha'));

      await service.startCityRun(1);
      // No timer advance: a one-unit run must settle on its own.
      await service.whenIdle();

      expect(runs[0].status).toBe(INGESTION_STATUS.COMPLETED);
    });

    it('refuses to start a second run while one is in flight', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(MID_MONTH);
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);
      prismaService.city.findUnique.mockResolvedValue(city(3, 'Gamma'));

      await service.startFullRun();

      await expect(service.startCityRun(3)).rejects.toBeInstanceOf(
        ConflictException,
      );

      await jest.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
      await service.whenIdle();

      // …and is allowed again once the first one is over.
      await expect(service.startCityRun(3)).resolves.toMatchObject({
        status: INGESTION_STATUS.RUNNING,
      });
      await service.whenIdle();
    });

    // The test above awaits the first start before attempting the second, so
    // the two never overlap — and the lock it proves is a check-then-act:
    // getActiveRun() is a database read, which yields the event loop, and the
    // create that follows is not conditional on what it saw.
    //
    // This is not a theoretical window. CitiesService fires startCityRun
    // without awaiting it from a request handler while the cron fires on its
    // own timer, so two triggers really can interleave exactly here.
    it('refuses the second of two runs triggered concurrently', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(MID_MONTH);
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);
      prismaService.city.findUnique.mockResolvedValue(city(3, 'Gamma'));

      const settled = await Promise.allSettled([
        service.startFullRun(),
        service.startCityRun(3),
      ]);

      const started = settled.filter((r) => r.status === 'fulfilled');
      const refused = settled.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(started).toHaveLength(1);
      expect(refused).toHaveLength(1);
      expect(refused[0].reason).toBeInstanceOf(ConflictException);

      // The database is the thing that has to hold: exactly one row may be
      // RUNNING, whatever the callers did.
      expect(runs.filter((r) => r.status === INGESTION_STATUS.RUNNING)).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
      await service.whenIdle();
    });

    it('rejects a run for a city that does not exist', async () => {
      prismaService.city.findUnique.mockResolvedValue(null);

      await expect(service.startCityRun(404)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(runs).toHaveLength(0);
    });

    it('reports the run in flight and the most recent one', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(MID_MONTH);
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);

      expect(await service.getActiveRun()).toBeNull();

      await service.startFullRun();
      expect(await service.getActiveRun()).toMatchObject({
        status: INGESTION_STATUS.RUNNING,
      });

      await jest.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
      await service.whenIdle();

      expect(await service.getActiveRun()).toBeNull();
      expect(await service.getLatestRun()).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
      });
    });

    /** A run owned by some other process, whose lease is `ageMs` old. */
    const abandonedRun = (ageMs: number): RunRow => ({
      id: 1,
      trigger: 'CRON',
      status: INGESTION_STATUS.RUNNING,
      scopeLabel: 'All cities',
      totalCities: 5,
      processed: 2,
      failed: 0,
      currentCity: 'Beta',
      errorMessage: null,
      startedAt: new Date(Date.now() - ageMs),
      finishedAt: null,
      ownerId: 'a-previous-process',
      heartbeatAt: new Date(Date.now() - ageMs),
    });

    it('closes runs left RUNNING by a previous process on startup', async () => {
      runs.push(abandonedRun(RUN_LEASE_MS * 2));

      await service.onModuleInit();

      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.FAILED,
        currentCity: null,
      });
      expect(runs[0].errorMessage).toContain('restart');
      expect(await service.getActiveRun()).toBeNull();
    });

    // The reaper used to close every RUNNING row unconditionally. With one
    // process that reads as tidy-up; with two it is an incident, because the
    // second instance to boot kills the first one's live collection — and the
    // loop it killed goes on writing to a row it no longer owns.
    it('leaves a run alone while another process is still refreshing its lease', async () => {
      runs.push(abandonedRun(RUN_HEARTBEAT_MS));

      await service.onModuleInit();

      expect(runs[0].status).toBe(INGESTION_STATUS.RUNNING);
      expect(runs[0].finishedAt).toBeNull();
      expect(await service.getActiveRun()).toMatchObject({ id: 1 });
    });

    it('does not let a reaped run report itself finished', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(MID_MONTH);
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha'));

      await service.startCityRun(1);

      // Something else decided this run was dead while its loop was mid-flight.
      runs[0].status = INGESTION_STATUS.FAILED;
      runs[0].ownerId = 'a-different-process';

      await service.whenIdle();

      // Every terminal write is pinned to the owner, so the loop's COMPLETED
      // matches no row rather than overwriting someone else's verdict.
      expect(runs[0].status).toBe(INGESTION_STATUS.FAILED);
    });
  });

  describe('Daily runs', () => {
    it('stays in the previous month on the 1st, when the new one is empty', async () => {
      // On the 1st both yesterday and the archive's edge (D-3) belong to the
      // previous month, so nothing should reach for the new one.
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-01T09:00:00.000Z'));
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha'));

      await service.startCityRun(1);
      await service.whenIdle();

      expect(archive.fetchMonth).toHaveBeenCalledTimes(1);
      expect(archive.fetchMonth).toHaveBeenCalledWith(
        SESSION,
        101,
        '2026-08-01',
        'alpha',
      );
    });

    it('upserts every returned day on (cityId, date), so in-month gaps self-heal', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha'));
      archive.fetchMonth.mockResolvedValue(
        monthDays('2026-08-01', '2026-08-02'),
      );

      await service.startCityRun(1);
      await service.whenIdle();

      expect(prismaService.dailyObservation.upsert).toHaveBeenCalledTimes(2);
      const [first] = prismaService.dailyObservation.upsert.mock.calls[0];
      expect(first.where).toEqual({
        cityId_date: { cityId: 1, date: new Date('2026-08-01T00:00:00.000Z') },
      });
      expect(first.create).toMatchObject({ cityId: 1, tMin: 4, tMax: 14 });
      expect(first.update).toMatchObject({ tMin: 4, tMax: 14 });
    });

    it('keeps asking for the previous month until its last days arrive', async () => {
      // The month tail is lost without this, with a cron that never misses a
      // run: a month's last two days are published three days late, by which
      // time a single-month plan has moved on and no later daily pass ever asks
      // for them again. August 2026 lost 08-30 and 08-31 exactly this way. On
      // the 6th the archive's edge is the 3rd, so August must still be planned.
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-06T09:00:00.000Z'));
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha'));
      // August is short of days, so it does not count as complete.
      prismaService.dailyObservation.count.mockResolvedValue(0);

      await service.startCityRun(1);
      await jest.advanceTimersByTimeAsync(MONTH_REQUEST_DELAY_MS);
      await service.whenIdle();

      expect(archive.fetchMonth.mock.calls.map((call) => call[2])).toEqual([
        '2026-08-01',
        '2026-09-01',
      ]);
    });

    it('pays nothing for the lookback once the month before is complete', async () => {
      // What makes the wider window affordable: a complete past month is
      // skipped with no HTTP call and no pacing, so on an ordinary day the
      // second month costs one count query per city.
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-06T09:00:00.000Z'));
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha'));
      prismaService.dailyObservation.count.mockResolvedValue(31);

      await service.startCityRun(1);
      await service.whenIdle();

      expect(archive.fetchMonth.mock.calls.map((call) => call[2])).toEqual([
        '2026-09-01',
      ]);
    });

    it('never asks for a month the source has not started publishing', async () => {
      // On the 2nd, yesterday is in September but the archive's edge is still
      // 30 August. Planning by the calendar asked for September, got an empty
      // payload and counted every city as failed — two days of red runs every
      // month, for a month that could not exist yet.
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-02T09:00:00.000Z'));
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha'));
      prismaService.dailyObservation.count.mockResolvedValue(0);

      await service.startCityRun(1);
      await service.whenIdle();

      expect(archive.fetchMonth.mock.calls.map((call) => call[2])).toEqual([
        '2026-08-01',
      ]);
    });

    it('never asks the archive for a month it cannot know about', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
      prismaService.city.findMany.mockResolvedValue([city(1, 'Alpha')]);

      await service.startFullRun();
      await service.whenIdle();

      expect(archive.fetchMonth).toHaveBeenCalledWith(
        SESSION,
        101,
        '2026-08-01',
        'alpha',
      );
    });
  });

  describe('Season backfill', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
    });

    it('counts one unit per city-month and labels the season', async () => {
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);

      const run = await service.startBackfillRun();

      // April..August inclusive = 5 months, twice over.
      expect(run.totalCities).toBe(10);
      expect(run.trigger).toBe(INGESTION_TRIGGER.MANUAL_BACKFILL);
      expect(run.scopeLabel).toContain('2026');

      await jest.advanceTimersByTimeAsync(
        REQUEST_DELAY_MS + 10 * MONTH_REQUEST_DELAY_MS,
      );
      await service.whenIdle();

      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 10,
        failed: 0,
      });
      expect(archive.fetchMonth).toHaveBeenCalledTimes(10);
      expect(
        archive.fetchMonth.mock.calls.map((c) => c[2]).slice(0, 5),
      ).toEqual([
        '2026-04-01',
        '2026-05-01',
        '2026-06-01',
        '2026-07-01',
        '2026-08-01',
      ]);
    });

    it('names the city and the month it is working on', async () => {
      prismaService.city.findMany.mockResolvedValue([city(1, 'Alpha')]);

      await service.startBackfillRun();
      await jest.advanceTimersByTimeAsync(0);

      expect(runs[0].currentCity).toContain('Alpha');
      expect(runs[0].currentCity).toContain('2026-04');
    });

    it('skips a past month that is already complete, without an HTTP call', async () => {
      // Resumability: retrying after a rate limit must not re-fetch what landed.
      prismaService.city.findMany.mockResolvedValue([city(1, 'Alpha')]);
      prismaService.dailyObservation.count.mockImplementation(
        ({ where }: { where: { date: { gte: Date } } }) =>
          Promise.resolve(where.date.gte.getUTCMonth() === 3 ? 30 : 0),
      );

      await service.startBackfillRun();
      await jest.advanceTimersByTimeAsync(10 * MONTH_REQUEST_DELAY_MS);
      await service.whenIdle();

      // April (30 stored days) never hits the network but still counts as done.
      expect(archive.fetchMonth.mock.calls.map((c) => c[2])).not.toContain(
        '2026-04-01',
      );
      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 5,
        failed: 0,
      });
    });

    it('does not pace a month it skipped', async () => {
      // Pacing exists to space out requests; a skipped month makes none, so
      // sitting out its delay is pure waste. Here only the current month is
      // fetched, and it is last — so the run needs no timer advance at all.
      prismaService.city.findMany.mockResolvedValue([city(1, 'Alpha')]);
      prismaService.dailyObservation.count.mockResolvedValue(31);

      await service.startBackfillRun();
      await service.whenIdle(); // no advanceTimersByTime

      expect(archive.fetchMonth.mock.calls.map((c) => c[2])).toEqual([
        '2026-08-01',
      ]);
      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 5,
        failed: 0,
      });
    });

    it('re-fetches the current month even when rows already exist', async () => {
      // The current month grows a day at a time — it is never "complete".
      prismaService.city.findMany.mockResolvedValue([city(1, 'Alpha')]);
      prismaService.dailyObservation.count.mockResolvedValue(31);

      await service.startBackfillRun();
      await jest.advanceTimersByTimeAsync(10 * MONTH_REQUEST_DELAY_MS);
      await service.whenIdle();

      expect(archive.fetchMonth.mock.calls.map((c) => c[2])).toEqual([
        '2026-08-01',
      ]);
    });

    it('treats a brand new city as a one-city season backfill', async () => {
      prismaService.city.findUnique.mockResolvedValue(city(9, 'Nuova'));

      const run = await service.startCityRun(9, INGESTION_TRIGGER.CITY_CREATED);

      expect(run.totalCities).toBe(5);
      await jest.advanceTimersByTimeAsync(5 * MONTH_REQUEST_DELAY_MS);
      await service.whenIdle();
      expect(archive.fetchMonth).toHaveBeenCalledTimes(5);
    });

    it('counts a month the archive returned nothing for as failed', async () => {
      prismaService.city.findMany.mockResolvedValue([city(1, 'Alpha')]);
      archive.fetchMonth.mockImplementation(
        (_session: ArchiveSession, _id: number, month: string) =>
          Promise.resolve(
            month === '2026-05-01' ? monthDays() : fullMonth(month.slice(0, 7)),
          ),
      );

      await service.startBackfillRun();
      await jest.advanceTimersByTimeAsync(10 * MONTH_REQUEST_DELAY_MS);
      await service.whenIdle();

      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 4,
        failed: 1,
      });
    });
  });

  describe('Locality ids and the per-run session', () => {
    it('caches a resolved locality id on the city', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
      prismaService.city.findUnique.mockResolvedValue(city(1, 'Alpha', null));
      archive.openSession.mockResolvedValue({
        localityId: 406,
        session: SESSION,
      });

      await service.startCityRun(1);
      await service.whenIdle();

      expect(prismaService.city.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { sourceLocalityId: 406 },
      });
      expect(archive.fetchMonth).toHaveBeenCalledWith(
        SESSION,
        406,
        expect.any(String),
        'alpha',
      );
    });

    it('opens one session per run and reuses it for every city', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);

      await service.startFullRun();
      await jest.advanceTimersByTimeAsync(REQUEST_DELAY_MS);
      await service.whenIdle();

      // Both cities already carry an id, so one handshake covers the whole run.
      expect(archive.openSession).toHaveBeenCalledTimes(1);
      expect(archive.resolveLocality).not.toHaveBeenCalled();
      expect(archive.fetchMonth.mock.calls.every((c) => c[0] === SESSION)).toBe(
        true,
      );
    });

    it('fails a city whose slug the source no longer knows, and keeps going', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Gone', null),
      ]);
      archive.resolveLocality.mockResolvedValue(null);

      await service.startFullRun();
      await jest.advanceTimersByTimeAsync(2 * REQUEST_DELAY_MS);
      await service.whenIdle();

      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 1,
        failed: 1,
      });
    });

    it("paces the retry when the first city's page fails, instead of bursting", async () => {
      // The page path shares the rate-limit budget, so falling through to the
      // next city must not fire its request immediately — a burst of page
      // fetches is what trips the limit in the first place.
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);
      archive.openSession
        .mockRejectedValueOnce(new Error('502 from the source'))
        .mockResolvedValue({ localityId: 102, session: SESSION });

      await service.startFullRun();
      await jest.advanceTimersByTimeAsync(REQUEST_DELAY_MS - 1);
      expect(archive.openSession).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      expect(archive.openSession).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(2 * REQUEST_DELAY_MS);
      await service.whenIdle();
      expect(runs[0]).toMatchObject({ processed: 1, failed: 1 });
    });

    it('fails the whole run loudly when the handshake can no longer be read', async () => {
      // Key rotation must never look like a quiet zero-row collection.
      jest.useFakeTimers();
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);
      archive.openSession.mockRejectedValue(
        new KeyExtractionError('no key in page'),
      );

      await service.startFullRun();
      await service.whenIdle();

      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.FAILED,
        processed: 0,
      });
      expect(runs[0].errorMessage).toContain('can no longer be read');
      expect(archive.fetchMonth).not.toHaveBeenCalled();
    });
  });

  describe('Rate limiting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
    });

    it('backs off and retries the same unit after the first 429', async () => {
      prismaService.city.findMany.mockResolvedValue([city(1, 'Alpha')]);
      archive.fetchMonth
        .mockRejectedValueOnce(new RateLimitError('429'))
        .mockResolvedValue(monthDays('2026-08-01'));

      await service.startFullRun();
      await jest.advanceTimersByTimeAsync(RATE_LIMIT_BACKOFF_MS);
      await service.whenIdle();

      expect(archive.fetchMonth).toHaveBeenCalledTimes(2);
      expect(runs[0]).toMatchObject({
        status: INGESTION_STATUS.COMPLETED,
        processed: 1,
        failed: 0,
      });
    });

    it('aborts the run on the second 429 rather than burning through the plan', async () => {
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
        city(3, 'Gamma'),
      ]);
      archive.fetchMonth.mockRejectedValue(new RateLimitError('429'));

      await service.startFullRun();
      await jest.advanceTimersByTimeAsync(RATE_LIMIT_BACKOFF_MS);
      await service.whenIdle();

      expect(runs[0].status).toBe(INGESTION_STATUS.FAILED);
      expect(runs[0].errorMessage).toContain('rate-limited');
      // Untouched cities are not blamed for a limit they never hit.
      expect(runs[0].failed).toBe(0);
      expect(archive.fetchMonth).toHaveBeenCalledTimes(2);
    });

    it('keeps the days it already stored when a run aborts', async () => {
      prismaService.city.findMany.mockResolvedValue([
        city(1, 'Alpha'),
        city(2, 'Beta'),
      ]);
      archive.fetchMonth
        .mockResolvedValueOnce(monthDays('2026-08-01'))
        .mockRejectedValue(new RateLimitError('429'));

      await service.startFullRun();
      await jest.advanceTimersByTimeAsync(
        REQUEST_DELAY_MS + RATE_LIMIT_BACKOFF_MS,
      );
      await service.whenIdle();

      expect(runs[0].status).toBe(INGESTION_STATUS.FAILED);
      expect(prismaService.dailyObservation.upsert).toHaveBeenCalledTimes(1);
      expect(runs[0].processed).toBe(1);
    });
  });
});
