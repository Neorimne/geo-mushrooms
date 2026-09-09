import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CitySummaryDto,
  NoteDto,
  ObservationDto,
  ObservationWithNote,
} from './dto/observation.dto';
import { DEFAULT_SUMMARY_DAYS, MAX_RANGE_DAYS } from './observations.constants';

const MS_PER_DAY = 86_400_000;

@Injectable()
export class ObservationsService {
  private readonly logger = new Logger(ObservationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * One row per active city for the list view: identity, the latest day in
   * full, and a trailing series for the sparkline.
   *
   * Two queries rather than a per-city loop — all the recent observations at
   * once, plus the city list so cities with nothing collected are still
   * represented — then grouped in memory.
   */
  async getSummaries(days = DEFAULT_SUMMARY_DAYS): Promise<CitySummaryDto[]> {
    const from = this.daysAgo(days);

    const [cities, observations] = await Promise.all([
      this.prisma.city.findMany({
        where: { isActive: true },
        include: { area: true },
      }),
      this.prisma.dailyObservation.findMany({
        where: { city: { isActive: true }, date: { gte: from } },
        include: { note: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const byCity = new Map<number, ObservationWithNote[]>();
    for (const observation of observations) {
      const bucket = byCity.get(observation.cityId);
      if (bucket) {
        bucket.push(observation);
      } else {
        byCity.set(observation.cityId, [observation]);
      }
    }

    // A city with nothing inside the window may still have older data. Its
    // newest day is fetched separately so "collected, but weeks behind" cannot
    // be mistaken for "never collected" — which is the state worth acting on.
    const behindTheWindow = await this.latestBefore(
      cities.filter((city) => !byCity.has(city.id)).map((city) => city.id),
    );

    return cities
      .map((city) =>
        CitySummaryDto.from(
          city,
          byCity.get(city.id) ?? [],
          behindTheWindow.get(city.id) ?? null,
        ),
      )
      .sort(
        (a, b) =>
          a.area.name.localeCompare(b.area.name) ||
          a.city.name.localeCompare(b.city.name),
      );
  }

  /**
   * The newest stored day of each of these cities, by id. Two queries rather
   * than one per city: `groupBy` finds each city's own maximum date, and a
   * single `findMany` reads exactly those rows back.
   */
  private async latestBefore(
    cityIds: number[],
  ): Promise<Map<number, ObservationWithNote>> {
    if (cityIds.length === 0) return new Map();

    const newest = await this.prisma.dailyObservation.groupBy({
      by: ['cityId'],
      where: { cityId: { in: cityIds } },
      _max: { date: true },
    });

    const pairs = newest
      .filter((row): row is typeof row & { _max: { date: Date } } =>
        Boolean(row._max.date),
      )
      .map((row) => ({ cityId: row.cityId, date: row._max.date }));

    if (pairs.length === 0) return new Map();

    const rows = await this.prisma.dailyObservation.findMany({
      where: { OR: pairs },
      include: { note: true },
    });

    return new Map(rows.map((row) => [row.cityId, row]));
  }

  /** One city's window, for the detail chart. Ascending, so the chart can walk it. */
  async getObservations(
    cityId: number,
    from: string,
    to: string,
  ): Promise<ObservationDto[]> {
    const { start, end } = this.capRange(from, to);

    const observations = await this.prisma.dailyObservation.findMany({
      where: { cityId, date: { gte: start, lte: end } },
      include: { note: true },
      orderBy: { date: 'asc' },
    });

    return observations.map((o) => ObservationDto.from(o));
  }

  /** When the archive was last read — drives the "updated at" chip in the header. */
  async getLastUpdate(): Promise<{ lastUpdate: Date | null }> {
    const latest = await this.prisma.dailyObservation.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });
    return { lastUpdate: latest?.fetchedAt ?? null };
  }

  /**
   * Creates or updates a day's note (1-to-1).
   * Verifies the observation exists, otherwise 404.
   */
  async upsertNote(observationId: number, text: string): Promise<NoteDto> {
    const observation = await this.prisma.dailyObservation.findUnique({
      where: { id: observationId },
      select: { id: true },
    });
    if (!observation) {
      throw new NotFoundException(
        `Observation with ID ${observationId} not found`,
      );
    }

    const note = await this.prisma.note.upsert({
      where: { observationId },
      update: { text },
      create: { observationId, text },
    });

    return NoteDto.from(note);
  }

  /**
   * Deletes a day's note.
   * Idempotent: returns { deletedCount: 0 } without erroring when there is none.
   */
  async deleteNote(observationId: number): Promise<{ deletedCount: number }> {
    const { count } = await this.prisma.note.deleteMany({
      where: { observationId },
    });
    return { deletedCount: count };
  }

  /**
   * Deletes a city's most recent stored day, so the next run can be watched
   * putting it back. The date is looked up rather than assumed to be today:
   * the archive stops at D-3, and a city may be further behind than that.
   */
  async deleteLatestForCity(cityId: number): Promise<{ deletedCount: number }> {
    const latest = await this.prisma.dailyObservation.findFirst({
      where: { cityId },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    if (!latest) {
      this.logger.warn(`🗑️ DEV: City ID ${cityId} has no observations to delete`);
      return { deletedCount: 0 };
    }

    const { count } = await this.prisma.dailyObservation.deleteMany({
      where: { cityId, date: latest.date },
    });
    this.logger.warn(
      `🗑️ DEV: Deleted ${count} observation(s) for City ID ${cityId} on ${latest.date.toISOString().slice(0, 10)}`,
    );
    return { deletedCount: count };
  }

  /**
   * The same, for every city of a region. Each city's own latest date is used —
   * cities can be a day out of step, and one shared cut-off would delete more
   * from some than from others.
   */
  async deleteLatestForRegion(
    areaId: number,
  ): Promise<{ deletedCount: number }> {
    const cities = await this.prisma.city.findMany({
      where: { areaId },
      select: { id: true },
    });

    if (cities.length === 0) {
      this.logger.warn(`🗑️ DEV: No cities found for Area ID ${areaId}`);
      return { deletedCount: 0 };
    }

    const latestPerCity = await this.prisma.dailyObservation.groupBy({
      by: ['cityId'],
      where: { cityId: { in: cities.map((c) => c.id) } },
      _max: { date: true },
    });

    let deletedCount = 0;
    for (const { cityId, _max } of latestPerCity) {
      if (!_max.date) continue;
      const { count } = await this.prisma.dailyObservation.deleteMany({
        where: { cityId, date: _max.date },
      });
      deletedCount += count;
    }

    this.logger.warn(
      `🗑️ DEV: Deleted ${deletedCount} observation(s) across ${cities.length} city(ies) for Area ID ${areaId}`,
    );
    return { deletedCount };
  }

  /** UTC midnight, `days` before today — observations are keyed by calendar day. */
  private daysAgo(days: number): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
    );
  }

  /**
   * Clamps a window to `MAX_RANGE_DAYS`, keeping its end. Clamping rather than
   * rejecting: a too-wide range is a client asking for "everything", and the
   * most recent year of it is the useful answer.
   */
  private capRange(from: string, to: string): { start: Date; end: Date } {
    const a = this.toUtcDay(from);
    const b = this.toUtcDay(to);

    // A reversed window is a client bug, not a reason to return nothing.
    const [requestedStart, end] = a <= b ? [a, b] : [b, a];
    const earliestAllowed = new Date(end.getTime() - MAX_RANGE_DAYS * MS_PER_DAY);

    return {
      start: requestedStart < earliestAllowed ? earliestAllowed : requestedStart,
      end,
    };
  }

  /** 'YYYY-MM-DD' (or a full ISO timestamp) to that day at UTC midnight. */
  private toUtcDay(iso: string): Date {
    return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  }
}
