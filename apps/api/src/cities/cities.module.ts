import { Module } from '@nestjs/common';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';
import { AreasModule } from '../areas/areas.module';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [AreasModule, IngestionModule],
  controllers: [CitiesController],
  providers: [CitiesService],
})
export class CitiesModule {}
