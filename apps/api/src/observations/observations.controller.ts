import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ObservationsService } from './observations.service';
import { UpsertNoteDto } from './dto/upsert-note.dto';
import { ObservationsQueryDto, SummaryQueryDto } from './dto/query.dto';
import { CitySummaryDto, NoteDto, ObservationDto } from './dto/observation.dto';
import { DevToolsGuard } from '../auth/dev-tools.guard';

@Controller('observations')
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  // --- Reads ---

  /** The list view: one row per city, latest day plus a short trailing series. */
  @Get('summary')
  async getSummary(@Query() query: SummaryQueryDto): Promise<CitySummaryDto[]> {
    return this.observationsService.getSummaries(query.days);
  }

  @Get('last-update')
  async getLastUpdate(): Promise<{ lastUpdate: Date | null }> {
    return this.observationsService.getLastUpdate();
  }

  /** The detail chart: one city over an explicit window. */
  @Get()
  async getObservations(
    @Query() query: ObservationsQueryDto,
  ): Promise<ObservationDto[]> {
    return this.observationsService.getObservations(
      query.cityId,
      query.from,
      query.to,
    );
  }

  // --- Dev tools: wipe the most recently collected day ---
  // Behind DevToolsGuard: returns 403 in production (ENABLE_DEV_TOOLS != "true").

  @UseGuards(DevToolsGuard)
  @Delete('latest/city/:id')
  async deleteLatestCity(@Param('id', ParseIntPipe) id: number) {
    return this.observationsService.deleteLatestForCity(id);
  }

  @UseGuards(DevToolsGuard)
  @Delete('latest/region/:id')
  async deleteLatestRegion(@Param('id', ParseIntPipe) id: number) {
    return this.observationsService.deleteLatestForRegion(id);
  }

  // --- Notes (written by the client while reviewing collected data) ---

  @Put(':id/note')
  async upsertNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertNoteDto,
  ): Promise<NoteDto> {
    return this.observationsService.upsertNote(id, body.text);
  }

  @Delete(':id/note')
  async deleteNote(@Param('id', ParseIntPipe) id: number) {
    return this.observationsService.deleteNote(id);
  }
}
