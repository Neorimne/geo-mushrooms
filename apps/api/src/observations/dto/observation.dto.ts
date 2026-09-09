import { Area, City, DailyObservation, Note } from '@prisma/client';

/** A note as the client sees it. */
export class NoteDto {
  id!: number;
  observationId!: number;
  text!: string;
  createdAt!: string;
  updatedAt!: string;

  static from(note: Note): NoteDto {
    return {
      id: note.id,
      observationId: note.observationId,
      text: note.text,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}

/** What an observation row looks like on the wire. */
export type ObservationWithNote = DailyObservation & { note?: Note | null };

/**
 * One observed day. Every metric is `number | null` — the source drops fields
 * often enough that the client has to handle gaps anyway, and a zero would be
 * a lie. `date` is the plain calendar day, never a timestamp: the observation
 * belongs to a day, not to a moment.
 */
export class ObservationDto {
  id!: number;
  cityId!: number;
  date!: string; // 'YYYY-MM-DD'

  tMin!: number | null;
  tMax!: number | null;
  tPerceived!: number | null;

  precipAmount!: number | null;
  precipUnit!: string | null; // 'mm' for rain, 'cm' for snow
  precipProb!: number | null;
  precipType!: string | null; // 'p' = rain, 'n' = snow

  windDirection!: string | null;
  windSpeed!: number | null; // knots, not km/h — convert before displaying
  windGust!: number | null; // knots; always windSpeed * 1.4

  humidity!: number | null;
  pressure!: number | null;
  uvIndex!: number | null;

  zeroThermalM!: number | null;
  snowLineM!: number | null;

  conditionText!: string | null;
  symbolId!: number | null;

  fetchedAt!: string;
  note!: NoteDto | null;

  static from(observation: ObservationWithNote): ObservationDto {
    return {
      id: observation.id,
      cityId: observation.cityId,
      date: observation.date.toISOString().slice(0, 10),
      tMin: observation.tMin,
      tMax: observation.tMax,
      tPerceived: observation.tPerceived,
      precipAmount: observation.precipAmount,
      precipUnit: observation.precipUnit,
      precipProb: observation.precipProb,
      precipType: observation.precipType,
      windDirection: observation.windDirection,
      windSpeed: observation.windSpeed,
      windGust: observation.windGust,
      humidity: observation.humidity,
      pressure: observation.pressure,
      uvIndex: observation.uvIndex,
      zeroThermalM: observation.zeroThermalM,
      snowLineM: observation.snowLineM,
      conditionText: observation.conditionText,
      symbolId: observation.symbolId,
      fetchedAt: observation.fetchedAt.toISOString(),
      note: observation.note ? NoteDto.from(observation.note) : null,
    };
  }
}

/**
 * Everything the list view needs for one city in a single row: who it is, the
 * most recent day in full, and a short trailing series for the sparkline.
 * Cities with no observations at all are still returned — an empty city is a
 * thing the user needs to see, not a row to hide.
 *
 * `latest` is the newest day the city has, which is not always the last of
 * `series`: a city that has fallen behind the window still has a latest day,
 * and reporting it as null would make it look like one that never collected.
 */
export class CitySummaryDto {
  city!: { id: number; name: string; slug: string };
  area!: { id: number; name: string };
  latest!: ObservationDto | null;
  series!: ObservationDto[]; // ascending by date

  static from(
    city: City & { area: Area },
    series: ObservationWithNote[],
    latestBeforeWindow: ObservationWithNote | null = null,
  ): CitySummaryDto {
    const dtos = series.map((o) => ObservationDto.from(o));
    const latest = dtos.length
      ? dtos[dtos.length - 1]
      : latestBeforeWindow && ObservationDto.from(latestBeforeWindow);

    return {
      city: { id: city.id, name: city.name, slug: city.slug },
      area: { id: city.area.id, name: city.area.name },
      latest: latest || null,
      series: dtos,
    };
  }
}
