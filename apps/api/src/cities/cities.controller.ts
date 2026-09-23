import { Body, Controller, Get, Post } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { CreateCityDto } from './dto/create-city.dto';

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
