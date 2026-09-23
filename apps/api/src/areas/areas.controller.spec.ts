import { Test, TestingModule } from '@nestjs/testing';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

describe('AreasController', () => {
  let controller: AreasController;
  let areasService: { findAll: jest.Mock };

  beforeEach(async () => {
    areasService = { findAll: jest.fn() };

    // No guard to stand in for: the controller declares none, because the
    // application's default is deny. That GET /areas is nonetheless closed to
    // an anonymous caller is asserted in app.module.spec.ts, which is the only
    // place the global guard exists.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AreasController],
      providers: [{ provide: AreasService, useValue: areasService }],
    }).compile();

    controller = module.get<AreasController>(AreasController);
  });

  it('returns the areas the service found, in the order it found them', async () => {
    const areas = [
      { id: 2, name: 'Val Rovina' },
      { id: 1, name: 'Val Serena' },
    ];
    areasService.findAll.mockResolvedValue(areas);

    await expect(controller.getAreas()).resolves.toBe(areas);
    expect(areasService.findAll).toHaveBeenCalled();
  });
});
