import { Controller, Get } from '@nestjs/common';
import { AreasService } from './areas.service';

@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  async getAreas() {
    return this.areasService.findAll();
  }
}
