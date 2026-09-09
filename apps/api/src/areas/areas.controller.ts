import { Controller, Get, UseGuards } from '@nestjs/common';
import { AreasService } from './areas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Get()
  async getAreas() {
    return this.areasService.findAll();
  }
}
