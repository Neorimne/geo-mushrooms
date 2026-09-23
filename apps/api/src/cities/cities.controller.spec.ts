import { Test, TestingModule } from '@nestjs/testing';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';

describe('CitiesController', () => {
  let controller: CitiesController;
  let citiesService: { findAll: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    citiesService = { findAll: jest.fn(), create: jest.fn() };

    // No guard to stand in for: the controller declares none, because the
    // application's default is deny. app.module.spec.ts is what proves it.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CitiesController],
      providers: [{ provide: CitiesService, useValue: citiesService }],
    }).compile();

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
