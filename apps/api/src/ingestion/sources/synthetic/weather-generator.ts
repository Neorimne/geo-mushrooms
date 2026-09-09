import { ParsedDay } from '../../archive-provider';

/**
 * Deterministic synthetic weather for a demo dataset.
 *
 * Two callers share it: the seeder, which writes a season of history at install
 * time, and `SyntheticArchiveProvider`, which answers collection runs. They must
 * agree — a run that re-collects a seeded month has to converge on the same
 * values, or the idempotent upsert would look broken while working perfectly.
 * So nothing here is random at call time: every value is a pure function of
 * (locality, date).
 *
 * The aim is data that reads as plausible, not data that is meteorologically
 * true. Two properties do most of that work: a seasonal baseline, so July is
 * warmer than October, and day-to-day correlation, so the chart draws a
 * wandering line instead of noise.
 */

/**
 * Deterministic 32-bit hash. Same string in, same number out, on every platform.
 *
 * The FNV-1a loop alone is not enough here, and the way it fails is quiet. Its
 * final multiply barely disturbs the high bits, so inputs differing only in
 * their last character — which is exactly what "the next day" is — land in
 * nearly the same place. Taking the top bits of that produced a temperature
 * series that crept by 0.008 a day and looked like a straight line. The murmur3
 * finalizer below is what actually spreads a one-character change across all 32
 * bits.
 */
export function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A stable pseudo-random number in [0, 1) for one named draw. */
function unit(seed: string): number {
  return hash(seed) / 4294967296;
}

/** The same, mapped to [-1, 1). */
function signed(seed: string): number {
  return unit(seed) * 2 - 1;
}

/** Days since epoch for a 'YYYY-MM-DD' string — the index every draw is keyed on. */
function dayIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
}

/**
 * Correlated noise in roughly [-1, 1] — the slow-moving part of a series.
 *
 * A per-day draw alone would jump 15 °C overnight. Averaging the draws of the
 * surrounding days buys correlation without carrying any state between calls:
 * neighbouring days share most of their window, so they land close together
 * while the series still wanders over a week.
 *
 * The window is deliberately narrow. A wider one produced a visibly *too*
 * smooth line — six consecutive days within half a degree, which reads as
 * synthetic at a glance and gives the chart nothing to draw.
 */
function drift(channel: string, locality: number, date: string): number {
  const centre = dayIndex(date);
  let total = 0;
  let weight = 0;
  for (let offset = -2; offset <= 2; offset++) {
    const w = 3 - Math.abs(offset);
    total += signed(`${channel}:${locality}:${centre + offset}`) * w;
    weight += w;
  }
  return total / weight;
}

/**
 * The fast-moving part: one independent draw for the day itself.
 *
 * Weather trends over a week *and* differs from yesterday. `drift` alone gives
 * only the first, so a day's value is the sum of the two — a wandering baseline
 * with real day-to-day movement on top.
 */
function jitter(channel: string, locality: number, date: string): number {
  return signed(`${channel}!${locality}:${dayIndex(date)}`);
}

/** Where in the year a date sits, 0 at 1 January and 1 at 31 December. */
function yearFraction(date: string): number {
  const d = new Date(`${date}T00:00:00.000Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = (d.getTime() - start) / 86_400_000;
  return dayOfYear / 365;
}

/** Peaks in late July, troughs in late January — northern-hemisphere Alpine. */
function seasonal(date: string, min: number, max: number): number {
  const phase = Math.cos((yearFraction(date) - 0.55) * 2 * Math.PI);
  return min + ((max - min) * (phase + 1)) / 2;
}

const CLEAR = ['clear', 'sunny', 'mostly sunny'];
const CLOUDY = ['partly cloudy', 'cloudy', 'overcast'];
const WET = ['light rain', 'rain', 'showers', 'thunderstorms'];
const SNOWY = ['light snow', 'snow', 'heavy snow'];

function pick(options: string[], seed: string): string {
  return options[Math.floor(unit(seed) * options.length)];
}

/**
 * One day for one locality. `elevation` shifts a town's whole temperature
 * series, so a list of cities does not read as the same weather eleven times.
 */
export function generateDay(
  locality: number,
  elevation: number,
  date: string,
): ParsedDay {
  const lapse = (elevation - 800) / 150; // ~1 °C per 150 m above the baseline town
  const base = seasonal(date, -3, 21) - lapse;
  const swing = 6 + drift('swing', locality, date) * 2 + jitter('swing', locality, date);

  const wander =
    drift('temp', locality, date) * 4.5 + jitter('temp', locality, date) * 2;

  const tMin = round1(base + wander - swing / 2);
  const tMax = round1(tMin + Math.max(3, swing));

  const wetness =
    drift('wet', locality, date) * 0.8 + jitter('wet', locality, date) * 0.35;
  const isWet = wetness > 0.15;
  const precipProb = clamp(Math.round((wetness + 1) * 50), 0, 100);

  // Snow is a consequence of the temperature the same day already produced, so
  // the unit and the reading never contradict each other.
  const isSnow = isWet && tMax < 2;
  const precipAmount = isWet
    ? round1(isSnow ? 1 + wetness * 12 : 0.4 + wetness * 22)
    : 0;

  const conditionText = isWet
    ? pick(isSnow ? SNOWY : WET, `cond:${locality}:${date}`)
    : precipProb > 35
      ? pick(CLOUDY, `cond:${locality}:${date}`)
      : pick(CLEAR, `cond:${locality}:${date}`);

  const windSpeed = round1(4 + (drift('wind', locality, date) + 1) * 6);

  return {
    date,
    tMin,
    tMax,
    tPerceived: round1(tMax - 1 - unit(`feel:${locality}:${date}`) * 2),
    precipAmount,
    // Centimetres on a snow day, millimetres otherwise. The unit travels with
    // the amount rather than being assumed anywhere downstream.
    precipUnit: isWet ? (isSnow ? 'cm' : 'mm') : 'mm',
    precipProb,
    // 'p' for rain, 'n' for snow, null on a dry day.
    precipType: isWet ? (isSnow ? 'n' : 'p') : null,
    windDirection: WIND_POINTS[hash(`dir:${locality}:${date}`) % WIND_POINTS.length],
    // Knots, as an archive would send it. The client converts at the edge.
    windSpeed,
    // Always the same multiple of the sustained speed, as the real archives do.
    windGust: round1(windSpeed * 1.4),
    humidity: clamp(Math.round(55 + wetness * 35 + signed(`hr:${locality}:${date}`) * 8), 20, 100),
    pressure: round1(1013 - wetness * 12 + signed(`pr:${locality}:${date}`) * 5),
    uvIndex: clamp(Math.round(seasonal(date, 1, 8) + signed(`uv:${locality}:${date}`)), 0, 11),
    zeroThermalM: Math.round(seasonal(date, 1200, 4100) + drift('zt', locality, date) * 350),
    snowLineM: Math.round(seasonal(date, 900, 3700) + drift('zt', locality, date) * 350),
    conditionText,
    symbolId: (hash(`sym:${locality}:${date}`) % 30) + 1,
  };
}

/** Compass points as an English-language source would label them. */
const WIND_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
