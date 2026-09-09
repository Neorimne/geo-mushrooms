import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ObservationsService } from './observations.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_RANGE_DAYS } from './observations.constants';

/** A stored observation row, with only the fields a test cares about set. */
function row(
  cityId: number,
  date: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: Number(date.replace(/-/g, '')) + cityId,
    cityId,
    date: new Date(`${date}T00:00:00.000Z`),
    tMin: 8,
    tMax: 19,
    tPerceived: null,
    precipAmount: 2.5,
    precipUnit: 'mm',
    precipProb: 40,
    precipType: 'p',
    windDirection: 'NE',
    windSpeed: 6,
    windGust: 9,
    humidity: 70,
    pressure: 1015,
    uvIndex: 4,
    zeroThermalM: 3400,
    snowLineM: null,
    conditionText: 'sereno',
    symbolId: 1,
    fetchedAt: new Date('2026-08-20T08:00:00.000Z'),
    note: null,
    ...overrides,
  };
}

const PIETRALTA = {
  id: 1,
  name: 'Pietralta',
  slug: 'pietralta',
  areaId: 1,
  isActive: true,
  sourceLocalityId: 406,
  createdAt: new Date(),
  area: { id: 1, name: 'Verdolo', isActive: true, createdAt: new Date() },
};

const VERDOLO = {
  ...PIETRALTA,
  id: 2,
  name: 'Verdolo',
  slug: 'verdolo',
};

describe('ObservationsService', () => {
  let service: ObservationsService;
  let prismaService: {
    dailyObservation: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
      groupBy: jest.Mock;
    };
    city: { findMany: jest.Mock };
    note: { upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));

    prismaService = {
      dailyObservation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      city: { findMany: jest.fn().mockResolvedValue([]) },
      note: {
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservationsService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<ObservationsService>(ObservationsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getSummaries', () => {
    it('groups a city\'s days into one summary, newest day as `latest`', async () => {
      prismaService.city.findMany.mockResolvedValue([PIETRALTA]);
      prismaService.dailyObservation.findMany.mockResolvedValue([
        row(1, '2026-08-17'),
        row(1, '2026-08-18'),
        row(1, '2026-08-19', { tMax: 25 }),
      ]);

      const [summary] = await service.getSummaries(14);

      expect(summary.city).toEqual({
        id: 1,
        name: 'Pietralta',
        slug: 'pietralta',
      });
      expect(summary.area).toEqual({ id: 1, name: 'Verdolo' });
      expect(summary.series.map((o) => o.date)).toEqual([
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
      ]);
      expect(summary.latest?.date).toBe('2026-08-19');
      expect(summary.latest?.tMax).toBe(25);
    });

    it('still returns a city that has no observations at all', async () => {
      // An empty city is something the user has to be able to see and re-collect.
      prismaService.city.findMany.mockResolvedValue([PIETRALTA, VERDOLO]);
      prismaService.dailyObservation.findMany.mockResolvedValue([
        row(1, '2026-08-19'),
      ]);

      const summaries = await service.getSummaries(14);

      expect(summaries).toHaveLength(2);
      const empty = summaries.find((s) => s.city.id === 2);
      expect(empty?.latest).toBeNull();
      expect(empty?.series).toEqual([]);
    });

    it('reports the newest day of a city that has fallen behind the window', async () => {
      // A city three weeks behind must not read like one that never collected:
      // that is exactly the city the user has to notice and re-collect.
      prismaService.city.findMany.mockResolvedValue([PIETRALTA]);
      prismaService.dailyObservation.findMany
        .mockResolvedValueOnce([]) // nothing inside the window
        .mockResolvedValueOnce([row(1, '2026-07-02')]); // but this is stored
      prismaService.dailyObservation.groupBy.mockResolvedValue([
        { cityId: 1, _max: { date: new Date('2026-07-02T00:00:00.000Z') } },
      ]);

      const [summary] = await service.getSummaries(14);

      expect(summary.latest?.date).toBe('2026-07-02');
      // The sparkline still only covers the window, so it stays empty.
      expect(summary.series).toEqual([]);
    });

    it('asks only for the requested window', async () => {
      prismaService.city.findMany.mockResolvedValue([PIETRALTA]);

      await service.getSummaries(7);

      const { where } = prismaService.dailyObservation.findMany.mock.calls[0][0];
      expect(where.date.gte).toEqual(new Date('2026-08-13T00:00:00.000Z'));
    });

    it('defaults to a 14-day window', async () => {
      prismaService.city.findMany.mockResolvedValue([PIETRALTA]);

      await service.getSummaries();

      const { where } = prismaService.dailyObservation.findMany.mock.calls[0][0];
      expect(where.date.gte).toEqual(new Date('2026-08-06T00:00:00.000Z'));
    });

    it('sorts by area, then by city', async () => {
      prismaService.city.findMany.mockResolvedValue([
        { ...VERDOLO, name: 'Zoldo', area: { ...PIETRALTA.area, id: 2, name: 'Zoldano' } },
        PIETRALTA,
      ]);

      const summaries = await service.getSummaries();

      expect(summaries.map((s) => s.area.name)).toEqual(['Verdolo', 'Zoldano']);
    });

    it('carries a day\'s note through to the client', async () => {
      prismaService.city.findMany.mockResolvedValue([PIETRALTA]);
      prismaService.dailyObservation.findMany.mockResolvedValue([
        row(1, '2026-08-19', {
          note: {
            id: 3,
            observationId: 42,
            text: 'Porcini by the lake',
            createdAt: new Date('2026-08-19T10:00:00.000Z'),
            updatedAt: new Date('2026-08-19T10:00:00.000Z'),
          },
        }),
      ]);

      const [summary] = await service.getSummaries();

      expect(summary.latest?.note?.text).toBe('Porcini by the lake');
      expect(summary.latest?.note?.createdAt).toBe('2026-08-19T10:00:00.000Z');
    });

    it('serialises a day as a calendar date, not a timestamp', async () => {
      prismaService.city.findMany.mockResolvedValue([PIETRALTA]);
      prismaService.dailyObservation.findMany.mockResolvedValue([
        row(1, '2026-08-19'),
      ]);

      const [summary] = await service.getSummaries();

      expect(summary.latest?.date).toBe('2026-08-19');
      expect(summary.latest?.fetchedAt).toBe('2026-08-20T08:00:00.000Z');
    });
  });

  describe('getObservations', () => {
    it('returns one city\'s window in ascending date order', async () => {
      prismaService.dailyObservation.findMany.mockResolvedValue([
        row(1, '2026-06-01'),
        row(1, '2026-06-02'),
      ]);

      const result = await service.getObservations(1, '2026-06-01', '2026-06-30');

      expect(result.map((o) => o.date)).toEqual(['2026-06-01', '2026-06-02']);
      const [args] = prismaService.dailyObservation.findMany.mock.calls[0];
      expect(args.where.cityId).toBe(1);
      expect(args.orderBy).toEqual({ date: 'asc' });
    });

    it('caps an over-long range instead of scanning years of rows', async () => {
      await service.getObservations(1, '2000-01-01', '2026-06-30');

      const [args] = prismaService.dailyObservation.findMany.mock.calls[0];
      const from = args.where.date.gte as Date;
      const to = args.where.date.lte as Date;
      const spanDays = (to.getTime() - from.getTime()) / 86_400_000;

      expect(spanDays).toBe(MAX_RANGE_DAYS);
    });

    it('leaves a range inside the cap alone', async () => {
      await service.getObservations(1, '2026-06-01', '2026-06-30');

      const [args] = prismaService.dailyObservation.findMany.mock.calls[0];
      expect(args.where.date.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'));
      expect(args.where.date.lte).toEqual(new Date('2026-06-30T00:00:00.000Z'));
    });
  });

  describe('getLastUpdate', () => {
    it('reports when the archive was last read', async () => {
      const fetchedAt = new Date('2026-08-20T08:00:00.000Z');
      prismaService.dailyObservation.findFirst.mockResolvedValue({ fetchedAt });

      await expect(service.getLastUpdate()).resolves.toEqual({
        lastUpdate: fetchedAt,
      });
      expect(prismaService.dailyObservation.findFirst).toHaveBeenCalledWith({
        orderBy: { fetchedAt: 'desc' },
        select: { fetchedAt: true },
      });
    });

    it('reports null when nothing has ever been collected', async () => {
      await expect(service.getLastUpdate()).resolves.toEqual({
        lastUpdate: null,
      });
    });
  });

  describe('notes', () => {
    it('creates or replaces the note on an observation', async () => {
      prismaService.dailyObservation.findUnique.mockResolvedValue({ id: 42 });
      prismaService.note.upsert.mockResolvedValue({
        id: 3,
        observationId: 42,
        text: 'Mushrooms by the river',
        createdAt: new Date('2026-08-19T10:00:00.000Z'),
        updatedAt: new Date('2026-08-19T10:00:00.000Z'),
      });

      const note = await service.upsertNote(42, 'Mushrooms by the river');

      expect(note).toMatchObject({ observationId: 42, text: 'Mushrooms by the river' });
      expect(prismaService.note.upsert).toHaveBeenCalledWith({
        where: { observationId: 42 },
        update: { text: 'Mushrooms by the river' },
        create: { observationId: 42, text: 'Mushrooms by the river' },
      });
    });

    it('404s rather than orphaning a note on a day that does not exist', async () => {
      prismaService.dailyObservation.findUnique.mockResolvedValue(null);

      await expect(service.upsertNote(999, 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes a note idempotently', async () => {
      await expect(service.deleteNote(42)).resolves.toEqual({ deletedCount: 0 });

      prismaService.note.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.deleteNote(42)).resolves.toEqual({ deletedCount: 1 });
    });
  });

  describe('dev tools', () => {
    it('deletes only the most recent stored day of a city', async () => {
      // Re-ingest testing: the next run puts the day straight back.
      prismaService.dailyObservation.findFirst.mockResolvedValue({
        date: new Date('2026-08-19T00:00:00.000Z'),
      });
      prismaService.dailyObservation.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.deleteLatestForCity(1)).resolves.toEqual({
        deletedCount: 1,
      });
      expect(prismaService.dailyObservation.deleteMany).toHaveBeenCalledWith({
        where: { cityId: 1, date: new Date('2026-08-19T00:00:00.000Z') },
      });
    });

    it('does nothing when a city has no observations', async () => {
      prismaService.dailyObservation.findFirst.mockResolvedValue(null);

      await expect(service.deleteLatestForCity(1)).resolves.toEqual({
        deletedCount: 0,
      });
      expect(prismaService.dailyObservation.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes each city\'s own latest day across a region', async () => {
      // Cities can be a day out of step, so one shared cut-off date would be wrong.
      prismaService.city.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      prismaService.dailyObservation.groupBy.mockResolvedValue([
        { cityId: 1, _max: { date: new Date('2026-08-19T00:00:00.000Z') } },
        { cityId: 2, _max: { date: new Date('2026-08-18T00:00:00.000Z') } },
      ]);
      prismaService.dailyObservation.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.deleteLatestForRegion(1)).resolves.toEqual({
        deletedCount: 2,
      });
      expect(prismaService.dailyObservation.deleteMany).toHaveBeenNthCalledWith(1, {
        where: { cityId: 1, date: new Date('2026-08-19T00:00:00.000Z') },
      });
      expect(prismaService.dailyObservation.deleteMany).toHaveBeenNthCalledWith(2, {
        where: { cityId: 2, date: new Date('2026-08-18T00:00:00.000Z') },
      });
    });

    it('does nothing for a region with no cities', async () => {
      prismaService.city.findMany.mockResolvedValue([]);

      await expect(service.deleteLatestForRegion(9)).resolves.toEqual({
        deletedCount: 0,
      });
      expect(prismaService.dailyObservation.deleteMany).not.toHaveBeenCalled();
    });
  });
});
