import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionRunDto } from './dto/ingestion-run.dto';

// A run takes minutes, so the trigger endpoints only record it and return its id;
// the client follows along through the two `runs` endpoints below.
@Controller('ingestion')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly ingestionService: IngestionService) {}

  @Post('runs')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerFullRun(): Promise<IngestionRunDto> {
    this.logger.log('Manual trigger received for a full collection run');
    return IngestionRunDto.from(await this.ingestionService.startFullRun());
  }

  @Post('runs/city/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCityRun(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<IngestionRunDto> {
    return IngestionRunDto.from(await this.ingestionService.startCityRun(id));
  }

  @Post('runs/backfill')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerBackfillRun(): Promise<IngestionRunDto> {
    this.logger.log('Manual trigger received for a season backfill');
    return IngestionRunDto.from(await this.ingestionService.startBackfillRun());
  }

  @Post('runs/region/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerRegionRun(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<IngestionRunDto> {
    return IngestionRunDto.from(await this.ingestionService.startRegionRun(id));
  }

  @Get('runs/active')
  async getActiveRun(): Promise<IngestionRunDto | null> {
    const run = await this.ingestionService.getActiveRun();
    return run ? IngestionRunDto.from(run) : null;
  }

  @Get('runs/latest')
  async getLatestRun(): Promise<IngestionRunDto | null> {
    const run = await this.ingestionService.getLatestRun();
    return run ? IngestionRunDto.from(run) : null;
  }
}
