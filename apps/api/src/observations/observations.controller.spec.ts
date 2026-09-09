import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ObservationsController } from './observations.controller';
import { ObservationsService } from './observations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevToolsGuard } from '../auth/dev-tools.guard';
import { ObservationsQueryDto, SummaryQueryDto } from './dto/query.dto';

describe('ObservationsController', () => {
  let controller: ObservationsController;
  let observationsService: {
    getSummaries: jest.Mock;
    getObservations: jest.Mock;
    getLastUpdate: jest.Mock;
    upsertNote: jest.Mock;
    deleteNote: jest.Mock;
    deleteLatestForCity: jest.Mock;
    deleteLatestForRegion: jest.Mock;
  };

  beforeEach(async () => {
    observationsService = {
      getSummaries: jest.fn().mockResolvedValue([]),
      getObservations: jest.fn().mockResolvedValue([]),
      getLastUpdate: jest.fn().mockResolvedValue({ lastUpdate: null }),
      upsertNote: jest.fn().mockResolvedValue({ id: 1 }),
      deleteNote: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteLatestForCity: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteLatestForRegion: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObservationsController],
      providers: [
        { provide: ObservationsService, useValue: observationsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(DevToolsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ObservationsController>(ObservationsController);
  });

  it('passes the requested window through to the summary', async () => {
    await controller.getSummary({ days: 30 });
    expect(observationsService.getSummaries).toHaveBeenCalledWith(30);
  });

  it('lets the service pick the default window when none is given', async () => {
    await controller.getSummary({});
    expect(observationsService.getSummaries).toHaveBeenCalledWith(undefined);
  });

  it('passes a detail query through unchanged', async () => {
    await controller.getObservations({
      cityId: 3,
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(observationsService.getObservations).toHaveBeenCalledWith(
      3,
      '2026-06-01',
      '2026-06-30',
    );
  });

  it('keys notes on the observation id', async () => {
    await controller.upsertNote(42, { text: 'Porcini by the lake' });
    expect(observationsService.upsertNote).toHaveBeenCalledWith(
      42,
      'Porcini by the lake',
    );

    await controller.deleteNote(42);
    expect(observationsService.deleteNote).toHaveBeenCalledWith(42);
  });

  it('exposes the dev-only latest-day deletes', async () => {
    await expect(controller.deleteLatestCity(1)).resolves.toEqual({
      deletedCount: 1,
    });
    await expect(controller.deleteLatestRegion(2)).resolves.toEqual({
      deletedCount: 2,
    });
  });

  describe('query validation', () => {
    it('coerces `days` from the query string and rejects out-of-range values', async () => {
      // Query params arrive as strings; the global pipe runs with transform: true.
      const ok = plainToInstance(SummaryQueryDto, { days: '30' });
      expect(await validate(ok)).toHaveLength(0);
      expect(ok.days).toBe(30);

      const tooBig = plainToInstance(SummaryQueryDto, { days: '90' });
      expect(await validate(tooBig)).not.toHaveLength(0);

      const zero = plainToInstance(SummaryQueryDto, { days: '0' });
      expect(await validate(zero)).not.toHaveLength(0);

      const missing = plainToInstance(SummaryQueryDto, {});
      expect(await validate(missing)).toHaveLength(0);
    });

    it('requires a numeric cityId and ISO dates on the detail query', async () => {
      const ok = plainToInstance(ObservationsQueryDto, {
        cityId: '3',
        from: '2026-06-01',
        to: '2026-06-30',
      });
      expect(await validate(ok)).toHaveLength(0);
      expect(ok.cityId).toBe(3);

      const badDate = plainToInstance(ObservationsQueryDto, {
        cityId: '3',
        from: 'giugno',
        to: '2026-06-30',
      });
      expect(await validate(badDate)).not.toHaveLength(0);

      const noCity = plainToInstance(ObservationsQueryDto, {
        from: '2026-06-01',
        to: '2026-06-30',
      });
      expect(await validate(noCity)).not.toHaveLength(0);
    });
  });
});
