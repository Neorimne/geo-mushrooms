import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: ConfigService, useValue: configService }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('getConfig', () => {
    it('reports devToolsEnabled true only when ENABLE_DEV_TOOLS is "true"', () => {
      configService.get.mockReturnValue('true');
      expect(controller.getConfig()).toEqual({ devToolsEnabled: true });
    });

    it('reports devToolsEnabled false otherwise', () => {
      configService.get.mockReturnValue('false');
      expect(controller.getConfig()).toEqual({ devToolsEnabled: false });
    });
  });
});
