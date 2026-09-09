import { Test, TestingModule } from '@nestjs/testing';
import { AreasService } from './areas.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AreasService', () => {
  let service: AreasService;
  let prismaService: {
    area: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prismaService = {
      area: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AreasService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<AreasService>(AreasService);
  });

  describe('findAll', () => {
    it('returns areas sorted alphabetically', async () => {
      const mockAreas = [
        { id: 1, name: 'Val Serena', isActive: true },
        { id: 2, name: 'Verdolo', isActive: true },
      ];
      prismaService.area.findMany.mockResolvedValue(mockAreas);

      const result = await service.findAll();

      expect(result).toEqual(mockAreas);
      expect(prismaService.area.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOrCreateByName', () => {
    it('upserts so an existing area with the same name is reused', async () => {
      prismaService.area.upsert.mockResolvedValue({ id: 2, name: 'Trentino' });

      const result = await service.findOrCreateByName('Trentino');

      expect(result).toEqual({ id: 2, name: 'Trentino' });
      expect(prismaService.area.upsert).toHaveBeenCalledWith({
        where: { name: 'Trentino' },
        update: {},
        create: { name: 'Trentino' },
      });
    });
  });
});
