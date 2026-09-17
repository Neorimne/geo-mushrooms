import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { IngestionRun } from '@prisma/client';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const run = (overrides: Partial<IngestionRun> = {}): IngestionRun => ({
  id: 7,
  trigger: 'MANUAL_ALL',
  status: 'RUNNING',
  scopeLabel: 'All cities',
  totalCities: 4,
  processed: 1,
  failed: 0,
  currentCity: 'Beta',
  errorMessage: null,
  startedAt: new Date('2026-08-05T08:00:00.000Z'),
  finishedAt: null,
  // Lease bookkeeping: held by the service, never exposed through the DTO.
  ownerId: 'this-process',
  heartbeatAt: new Date('2026-08-05T08:00:00.000Z'),
  ...overrides,
});

describe('IngestionController', () => {
  let controller: IngestionController;
  let ingestionService: {
    startFullRun: jest.Mock;
    startCityRun: jest.Mock;
    startRegionRun: jest.Mock;
    startBackfillRun: jest.Mock;
    getActiveRun: jest.Mock;
    getLatestRun: jest.Mock;
  };

  beforeEach(async () => {
    ingestionService = {
      startFullRun: jest.fn().mockResolvedValue(run()),
      startCityRun: jest.fn().mockResolvedValue(run({ scopeLabel: 'Alpha' })),
      startRegionRun: jest.fn().mockResolvedValue(run({ scopeLabel: 'Val Serena' })),
      startBackfillRun: jest.fn().mockResolvedValue(
        run({ trigger: 'MANUAL_BACKFILL', scopeLabel: 'Season 2026 (Apr–Aug)', totalCities: 20 }),
      ),
      getActiveRun: jest.fn().mockResolvedValue(null),
      getLatestRun: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionController],
      providers: [{ provide: IngestionService, useValue: ingestionService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IngestionController>(IngestionController);
  });

  describe('triggers', () => {
    it('returns the newly started run', async () => {
      const result = await controller.triggerFullRun();

      expect(ingestionService.startFullRun).toHaveBeenCalled();
      expect(result).toMatchObject({ id: 7, status: 'RUNNING', totalCities: 4 });
      // Dates cross the wire as ISO strings, not Date instances.
      expect(result.startedAt).toBe('2026-08-05T08:00:00.000Z');
      expect(result.finishedAt).toBeNull();
    });

    it('passes the id through for a single city', async () => {
      await controller.triggerCityRun(12);
      expect(ingestionService.startCityRun).toHaveBeenCalledWith(12);
    });

    it('passes the id through for a region', async () => {
      await controller.triggerRegionRun(3);
      expect(ingestionService.startRegionRun).toHaveBeenCalledWith(3);
    });

    it('starts a season backfill, whose units are city-months', async () => {
      const result = await controller.triggerBackfillRun();

      expect(ingestionService.startBackfillRun).toHaveBeenCalled();
      // Same DTO as any other run — the progress UI needs no new shape.
      expect(result).toMatchObject({
        trigger: 'MANUAL_BACKFILL',
        totalCities: 20,
        scopeLabel: 'Season 2026 (Apr–Aug)',
      });
    });

    it('surfaces a rejected trigger instead of swallowing it', async () => {
      ingestionService.startFullRun.mockRejectedValue(new ConflictException());

      await expect(controller.triggerFullRun()).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('reads', () => {
    it('returns null when nothing is being collected', async () => {
      await expect(controller.getActiveRun()).resolves.toBeNull();
    });

    it('returns the run in flight', async () => {
      ingestionService.getActiveRun.mockResolvedValue(run());

      await expect(controller.getActiveRun()).resolves.toMatchObject({
        id: 7,
        status: 'RUNNING',
        currentCity: 'Beta',
      });
    });

    it('returns the last finished run with its end time', async () => {
      ingestionService.getLatestRun.mockResolvedValue(
        run({
          status: 'COMPLETED',
          processed: 4,
          currentCity: null,
          finishedAt: new Date('2026-08-05T08:03:00.000Z'),
        }),
      );

      const result = await controller.getLatestRun();

      expect(result).toMatchObject({ status: 'COMPLETED', processed: 4 });
      expect(result?.finishedAt).toBe('2026-08-05T08:03:00.000Z');
    });
  });

  // Lease bookkeeping is how the service decides who owns a run; it is not part
  // of the run's public shape, and the UI polls this payload.
  it('keeps the lease columns out of the response', async () => {
    ingestionService.getActiveRun.mockResolvedValue(run());

    const result = await controller.getActiveRun();

    expect(result).not.toHaveProperty('ownerId');
    expect(result).not.toHaveProperty('heartbeatAt');
  });
});
