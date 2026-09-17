import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../prisma/prisma-errors';
import { AreasService } from '../areas/areas.service';
import { IngestionService } from '../ingestion/ingestion.service';
import {
  ARCHIVE_PROVIDER,
  ArchiveProvider,
} from '../ingestion/archive-provider';
import { INGESTION_TRIGGER } from '../ingestion/ingestion.constants';
import { CreateCityDto } from './dto/create-city.dto';

@Injectable()
export class CitiesService {
  private readonly logger = new Logger(CitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly areasService: AreasService,
    private readonly ingestionService: IngestionService,
    @Inject(ARCHIVE_PROVIDER) private readonly archive: ArchiveProvider,
  ) {}

  async findAll() {
    return this.prisma.city.findMany({
      include: { area: true },
    });
  }

  /**
   * Creates a city: checks slug uniqueness, resolves the slug to the source's
   * numeric locality id, resolves or creates the area, and kicks off a one-off
   * collection run in the background.
   */
  async create(dto: CreateCityDto) {
    const name = dto.name.trim();
    const slug = dto.slug.trim();
    const areaName = dto.areaName?.trim();

    if (!name) {
      throw new BadRequestException('City name is required');
    }
    if (!slug) {
      throw new BadRequestException('City slug is required');
    }
    if (!dto.areaId && !areaName) {
      throw new BadRequestException(
        'Area selection or new Area name is required',
      );
    }

    const normalizedSlug = slug.toLowerCase();
    // A pre-flight check, kept for the message it gives: it costs one query and
    // lets a duplicate be rejected before the archive is asked about the slug.
    // It is not the guarantee, though — see the create below.
    const existingCity = await this.prisma.city.findUnique({
      where: { slug: normalizedSlug },
    });
    if (existingCity) {
      throw new BadRequestException('City with this slug already exists');
    }

    // The archive is keyed by a numeric locality id, not by the slug, so
    // validation and id lookup are the same request: a slug the source does not
    // know has no id, and a city without an id can never be collected.
    const sourceLocalityId = await this.archive.resolveLocality(slug);
    if (sourceLocalityId === null) {
      throw new BadRequestException('The archive does not know that city id');
    }

    const finalAreaId = await this.resolveAreaId(dto.areaId, areaName);

    // The check above and this insert are two statements, so two requests for
    // the same slug can both pass the check. `City.slug` is unique, so the
    // database refuses the second one — and without this catch that arrived as
    // an unhandled P2002, i.e. a 500 for what the checked path already calls a
    // bad request. Same rule, same answer, whichever way it is reached.
    let newCity;
    try {
      newCity = await this.prisma.city.create({
        data: {
          name,
          slug: normalizedSlug,
          areaId: finalAreaId,
          isActive: true,
          sourceLocalityId,
        },
        include: { area: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new BadRequestException('City with this slug already exists');
    }

    // Kick off a first collection for the new city — a whole-season backfill, so
    // a city added mid-season arrives with history rather than a single day.
    // Never at the cost of the city itself: if another run holds the lock the
    // user can trigger one later.
    this.ingestionService
      .startCityRun(newCity.id, INGESTION_TRIGGER.CITY_CREATED)
      .catch((e) => {
        this.logger.warn(
          `No initial collection for ${newCity.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      });

    return newCity;
  }

  private async resolveAreaId(
    areaId: number | undefined,
    areaName: string | undefined,
  ): Promise<number> {
    if (areaId) {
      const area = await this.areasService.findById(Number(areaId));
      if (!area) {
        throw new BadRequestException(
          `Specified Area with ID ${areaId} does not exist`,
        );
      }
      return area.id;
    }

    if (areaName) {
      const area = await this.areasService.findOrCreateByName(areaName);
      return area.id;
    }

    throw new BadRequestException(
      'Area selection or new Area name is required',
    );
  }
}
