export interface Area {
  id: number;
  name: string;
  isActive: boolean;
}

export interface City {
  id: number;
  name: string;
  slug: string;
  areaId: number;
  area?: Area;
}

export interface Note {
  id: number;
  observationId: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One observed day for one city.
 *
 * Every metric is `number | null`: the source drops fields often enough that a
 * gap is normal, and a `0` in its place would read as a real measurement.
 * Templates must handle null explicitly rather than lean on falsiness — a
 * temperature of 0 °C is data, not a missing value.
 */
export interface Observation {
  id: number;
  cityId: number;
  date: string; // 'YYYY-MM-DD' — a calendar day, not a timestamp

  tMin: number | null;
  tMax: number | null;
  tPerceived: number | null;

  /** Amount of precipitation, in `precipUnit` — mm of rain, but cm of snow. */
  precipAmount: number | null;
  precipUnit: string | null;
  precipProb: number | null;
  /** 'p' = rain, 'n' = snow. */
  precipType: string | null;

  windDirection: string | null; // 16-point compass, e.g. 'SSW'
  /** Wind speed in **knots**, as stored. Use `windSpeedKmh()` to display it. */
  windSpeed: number | null;
  /** Knots; always `windSpeed` * 1.4, which is why nothing plots it. */
  windGust: number | null;

  humidity: number | null;
  pressure: number | null;
  uvIndex: number | null;

  zeroThermalM: number | null;
  snowLineM: number | null;

  conditionText: string | null; // Italian, e.g. 'rovesci e schiarite'
  symbolId: number | null;

  fetchedAt: string;
  note: Note | null;
}

/**
 * How a day's precipitation should be labelled.
 *
 * Falls back to 'mm', which is what an archive sends on every day that is not
 * snow — but the stored unit always wins when there is one, because a snow day
 * arrives in centimetres and printing it as millimetres would overstate it
 * tenfold.
 */
export function precipUnitLabel(unit: string | null): string {
  return unit ? unit.toLowerCase() : 'mm';
}

/**
 * A day's precipitation in millimetres, whatever unit it arrived in.
 *
 * Storing the unit alongside the amount keeps a snow day honest, but a chart
 * has one y axis: plotting 1.8 (cm of snow) next to 12 (mm of rain) would draw
 * the wetter day as the smaller bar. Charts convert; per-day readouts keep the
 * unit the source sent.
 */
export function precipInMm(
  amount: number | null,
  unit: string | null,
): number | null {
  if (amount === null) return null;
  return unit?.toLowerCase() === 'cm' ? amount * 10 : amount;
}

const KNOTS_TO_KMH = 1.852;

/**
 * A day's wind speed in km/h. The stored value is in **knots**.
 *
 * Daily archives publish wind with no unit attached, and it is not what it looks
 * like: the number is knots, so printing it as km/h understates a windy day by
 * 45%. Storing the source's own figure and converting here is what keeps the
 * stored column honest about where it came from.
 *
 * The column stays a verbatim copy of the source; the conversion belongs here,
 * at the point of display. Whole numbers only: the source's granularity is one
 * knot, so a decimal would be precision we do not have.
 */
export function windSpeedKmh(knots: number | null): number | null {
  if (knots === null) return null;
  return Math.round(knots * KNOTS_TO_KMH);
}

/**
 * The 16-point compass as a bearing in degrees.
 *
 * Kept as an explicit table rather than computed from an index: a provider may
 * send any of these codes, and an unrecognised one has to be distinguishable
 * from a valid bearing of zero.
 */
export const WIND_DIRECTION_DEGREES: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

/**
 * How far to rotate an arrow glyph that points where the wind is *going*.
 *
 * Meteorological direction names where the wind comes **from**, so the arrow is
 * half a turn from the bearing. Dropping that 180° is the classic bug in this
 * corner — a northerly would be drawn pointing north, at the weather it left.
 *
 * Null for a missing or unrecognised code: no arrow is better than a wrong one.
 */
export function windArrowRotation(direction: string | null): number | null {
  if (!direction) return null;
  const bearing = WIND_DIRECTION_DEGREES[direction.toUpperCase()];
  return bearing === undefined ? null : (bearing + 180) % 360;
}

/**
 * The direction as it should be printed and announced — 'ssw' -> 'SSW'.
 *
 * It normalises rather than translates, and still returns null for anything
 * unrecognised, so a caller cannot print a code the compass table does not
 * know. Null is the same answer `windArrowRotation` gives, which keeps the
 * glyph and its label from ever disagreeing about whether a direction is valid.
 */
export function windDirectionLabel(direction: string | null): string | null {
  if (!direction) return null;
  const point = direction.toUpperCase();
  return point in WIND_DIRECTION_DEGREES ? point : null;
}

/** One city's row in the list view: who it is, its latest day, and a short series. */
export interface CitySummary {
  city: { id: number; name: string; slug: string };
  area: { id: number; name: string };
  latest: Observation | null;
  series: Observation[]; // ascending by date
}

/** Area heading plus the cities under it. */
export interface AreaGroup {
  name: string;
  areaId: number;
  cities: CitySummary[];
}

export type IngestionRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

/**
 * One collection run, polled while it is RUNNING to drive the progress bar.
 *
 * `totalCities`/`currentCity` are legacy names: a run's unit is a city on the
 * daily pass but a city-month on a season backfill, so `currentCity` may read
 * "Pietralta — 2026-05".
 */
export interface IngestionRun {
  id: number;
  trigger: string;
  status: IngestionRunStatus;
  scopeLabel: string | null;
  totalCities: number;
  processed: number;
  failed: number;
  currentCity: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** How far back a detail view reaches. */
export type DetailRange = '14d' | '30d' | 'season';

/**
 * Days the source withholds while its meteorologists check them, so the archive
 * ends at D-3 rather than D-1.
 *
 * The `/storico` page states it: «Ultimi due giorni in validazione». Mirrored
 * from `ingestion.constants.ts`, which this library cannot import — change both
 * together.
 */
export const ARCHIVE_VALIDATION_DAYS = 2;

/**
 * The freshest day the archive can possibly hold, as 'YYYY-MM-DD'.
 *
 * Not yesterday. Reading it as yesterday marked every city "not updated" for
 * ever — the same false alarm as expecting *today*, one step further along.
 */
export function newestArchiveDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1 - ARCHIVE_VALIDATION_DAYS,
    ),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Whether a city is as up to date as the source allows — which is what the
 * reader actually wants to know. A city that has fallen behind the others still
 * shows as stale; a source-wide validation lag no longer does.
 */
export function isFresh(summary: CitySummary): boolean {
  return summary.latest?.date === newestArchiveDayIso();
}
