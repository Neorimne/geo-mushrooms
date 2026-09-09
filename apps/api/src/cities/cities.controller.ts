import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { CreateCityDto } from './dto/create-city.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Get()
  async getCities() {
    return this.citiesService.findAll();
  }

  @Post()
  async createCity(@Body() dto: CreateCityDto) {
    return this.citiesService.create(dto);
  }
}
