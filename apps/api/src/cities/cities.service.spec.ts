import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { PrismaService } from '../prisma/prisma.service';
import { AreasService } from '../areas/areas.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { ARCHIVE_PROVIDER } from '../ingestion/archive-provider';
import { RateLimitError } from '../ingestion/archive.errors';

describe('CitiesService', () => {
  let service: CitiesService;
  let prismaService: {
    city: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  };
  let areasService: { findById: jest.Mock; findOrCreateByName: jest.Mock };
  let scraperService: { startCityRun: jest.Mock };
  let archiveClient: { resolveLocality: jest.Mock };

  beforeEach(async () => {
    prismaService = {
      city: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    areasService = {
      findById: jest.fn(),
      findOrCreateByName: jest.fn(),
    };

    scraperService = {
      startCityRun: jest.fn().mockResolvedValue({ id: 1 }),
    };

    archiveClient = {
      resolveLocality: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CitiesService,
        { provide: PrismaService, useValue: prismaService },
        { provide: AreasService, useValue: areasService },
        { provide: IngestionService, useValue: scraperService },
        { provide: ARCHIVE_PROVIDER, useValue: archiveClient },
      ],
    }).compile();

    service = module.get<CitiesService>(CitiesService);
  });

  describe('findAll', () => {
    it('returns cities with their area attached', async () => {
      const cities = [{ id: 1, name: 'Pietralta', area: { id: 1, name: 'Verdolo' } }];
      prismaService.city.findMany.mockResolvedValue(cities);

      const result = await service.findAll();

      expect(result).toEqual(cities);
      expect(prismaService.city.findMany).toHaveBeenCalledWith({
        include: { area: true },
      });
    });
  });

  describe('create', () => {
    it('rejects when neither areaId nor areaName is provided', async () => {
      await expect(
        service.create({ name: 'Pietralta', slug: 'pietralta', areaName: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the slug already exists', async () => {
      prismaService.city.findUnique.mockResolvedValue({ id: 10, name: 'Existing' });

      await expect(
        service.create({ name: 'Pietralta', slug: 'pietralta', areaId: 1 }),
      ).rejects.toThrow('City with this slug already exists');
    });

    it('rejects a slug the source does not know', async () => {
      prismaService.city.findUnique.mockResolvedValue(null);
      archiveClient.resolveLocality.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Pietralta', slug: 'invalid-slug', areaId: 1 }),
      ).rejects.toThrow('does not know that city id');
      expect(prismaService.city.create).not.toHaveBeenCalled();
    });

    it('surfaces a rate limit instead of blaming the slug', async () => {
      // A 429 says nothing about whether the slug is valid — telling the user
      // their input is wrong would send them off fixing the wrong thing.
      prismaService.city.findUnique.mockResolvedValue(null);
      archiveClient.resolveLocality.mockRejectedValue(new RateLimitError('429'));

      await expect(
        service.create({ name: 'Pietralta', slug: 'pietralta', areaId: 1 }),
      ).rejects.toBeInstanceOf(RateLimitError);
      expect(prismaService.city.create).not.toHaveBeenCalled();
    });

    it('rejects when the referenced area does not exist', async () => {
      prismaService.city.findUnique.mockResolvedValue(null);
      archiveClient.resolveLocality.mockResolvedValue(406);
      areasService.findById.mockResolvedValue(null);

      await expect(
        service.create({ name: 'Pietralta', slug: 'pietralta', areaId: 42 }),
      ).rejects.toThrow('Specified Area with ID 42 does not exist');
      expect(prismaService.city.create).not.toHaveBeenCalled();
    });

    it('creates a city in an existing area, caching the locality id it just resolved', async () => {
      const mockCity = { id: 5, name: 'Pietralta', slug: 'pietralta', areaId: 1, area: { id: 1, name: 'Verdolo' } };
      prismaService.city.findUnique.mockResolvedValue(null);
      archiveClient.resolveLocality.mockResolvedValue(406);
      areasService.findById.mockResolvedValue({ id: 1, name: 'Verdolo' });
      prismaService.city.create.mockResolvedValue(mockCity);

      const result = await service.create({ name: 'Pietralta', slug: 'pietralta', areaId: 1 });

      expect(result).toEqual(mockCity);
      expect(areasService.findById).toHaveBeenCalledWith(1);
      // The id comes free with validation — storing it now saves the first run
      // a page fetch it might not get past the rate limit.
      expect(prismaService.city.create).toHaveBeenCalledWith({
        data: {
          name: 'Pietralta',
          slug: 'pietralta',
          areaId: 1,
          isActive: true,
          sourceLocalityId: 406,
        },
        include: { area: true },
      });
      expect(scraperService.startCityRun).toHaveBeenCalledWith(5, 'CITY_CREATED');
    });

    it('creates a city in a brand new area and triggers a scrape', async () => {
      const mockCity = { id: 6, name: 'Canazei', slug: 'canazei', areaId: 2, area: { id: 2, name: 'Trentino' } };
      prismaService.city.findUnique.mockResolvedValue(null);
      archiveClient.resolveLocality.mockResolvedValue(1234);
      areasService.findOrCreateByName.mockResolvedValue({ id: 2, name: 'Trentino' });
      prismaService.city.create.mockResolvedValue(mockCity);

      const result = await service.create({ name: 'Canazei', slug: 'canazei', areaName: 'Trentino' });

      expect(result).toEqual(mockCity);
      expect(areasService.findOrCreateByName).toHaveBeenCalledWith('Trentino');
      expect(prismaService.city.create).toHaveBeenCalledWith({
        data: {
          name: 'Canazei',
          slug: 'canazei',
          areaId: 2,
          isActive: true,
          sourceLocalityId: 1234,
        },
        include: { area: true },
      });
      expect(scraperService.startCityRun).toHaveBeenCalledWith(6, 'CITY_CREATED');
    });
  });
});
