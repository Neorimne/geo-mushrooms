import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate } from '@nestjs/common';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('CitiesController', () => {
  let controller: CitiesController;
  let citiesService: { findAll: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    citiesService = { findAll: jest.fn(), create: jest.fn() };

    const mockGuard: CanActivate = { canActivate: () => true };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CitiesController],
      providers: [{ provide: CitiesService, useValue: citiesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<CitiesController>(CitiesController);
  });

  it('delegates createCity to CitiesService and returns the created city', async () => {
    const dto = { name: 'Pietralta', slug: 'pietralta', areaId: 1 };
    const mockCity = { id: 5, name: 'Pietralta', slug: 'pietralta', areaId: 1, area: { id: 1, name: 'Verdolo' } };
    citiesService.create.mockResolvedValue(mockCity);

    const result = await controller.createCity(dto);

    expect(citiesService.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockCity);
  });
});
