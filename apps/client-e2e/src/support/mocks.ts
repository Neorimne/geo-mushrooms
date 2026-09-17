import { Page } from '@playwright/test';

/**
 * Shared backend mocks for the e2e suite.
 *
 * Every spec is hermetic: routes are intercepted so nothing depends on a
 * running API or a seeded database. Patterns are regexes rather than globs
 * because the query strings (`?days=14`, `?cityId=7&from=…`) make glob `?`
 * ambiguous, and because they must not overlap each other.
 */

export interface MockNote {
  id: number;
  observationId: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface MockObservation {
  id: number;
  cityId: number;
  date: string;
  tMin: number | null;
  tMax: number | null;
  tPerceived: number | null;
  precipAmount: number | null;
  precipUnit: string | null;
  precipProb: number | null;
  precipType: string | null;
  windDirection: string | null;
  windSpeed: number | null;
  windGust: number | null;
  humidity: number | null;
  pressure: number | null;
  uvIndex: number | null;
  zeroThermalM: number | null;
  snowLineM: number | null;
  conditionText: string | null;
  symbolId: number | null;
  fetchedAt: string;
  note: MockNote | null;
}

export const ROUTES = {
  config: /\/config$/,
  areas: /\/areas$/,
  summary: /\/observations\/summary/,
  lastUpdate: /\/observations\/last-update/,
  observations: /\/observations\?cityId=/,
  note: /\/observations\/\d+\/note$/,
  latestRun: /\/ingestion\/runs\/latest/,
  regionRun: /\/ingestion\/runs\/region\//,
  backfillRun: /\/ingestion\/runs\/backfill/,
};

/**
 * The archive's edge as 'YYYY-MM-DD' — what the app treats as fresh.
 *
 * D-3, not yesterday: a daily archive withholds its last two days while they
 * are validated.
 *
 * This is the one copy of that arithmetic left standing, and it stays on
 * purpose. The suite mocks the API it tests, so importing the app's own
 * `@geo/shared/util-archive` would let the test and the code agree by
 * construction rather than by working. The `type:e2e` dep constraint in
 * `eslint.config.mjs` enforces that independence now, so this copy is a
 * decision the linter holds us to rather than an oversight waiting to drift.
 */
export function newestArchiveDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3),
  )
    .toISOString()
    .slice(0, 10);
}

/** A day of observed weather, with only the interesting parts spelled out. */
export function observation(
  id: number,
  cityId: number,
  date: string,
  overrides: Partial<MockObservation> = {},
): MockObservation {
  return {
    id,
    cityId,
    date,
    tMin: 12,
    tMax: 24,
    tPerceived: 23,
    precipAmount: 2.4,
    precipUnit: 'mm',
    precipProb: 40,
    precipType: 'p',
    windDirection: 'SSW',
    windSpeed: 6,
    windGust: 9.2,
    humidity: 88,
    pressure: 1015.5,
    uvIndex: 5,
    zeroThermalM: 3900,
    snowLineM: 3200,
    conditionText: 'rovesci e schiarite',
    symbolId: 1,
    fetchedAt: '2026-08-20T08:00:00.000Z',
    note: null,
    ...overrides,
  };
}

export function citySummary(
  cityId: number,
  cityName: string,
  areaName: string,
  series: MockObservation[],
) {
  return {
    city: { id: cityId, name: cityName, slug: cityName.toLowerCase() },
    area: { id: 1, name: areaName },
    latest: series.length ? series[series.length - 1] : null,
    series,
  };
}

/** A non-expired JWT so AuthStore treats the session as authenticated. */
export async function authenticate(page: Page) {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: 9999999999 }));
    window.localStorage.setItem('auth_token', `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`);
  });
}

/**
 * The routes every spec needs, with the caller's data behind them.
 *
 * `runs/latest` is included even though most specs do not care about runs: the
 * list view polls it on load, and an unmocked request reaches a real API, whose
 * 401 makes authInterceptor log the session out and bounce the page to /login.
 * `latestRun` is a getter so a spec can hand over mutable run state without
 * having to re-register the route and depend on matcher precedence.
 */
export async function mockBaseRoutes(
  page: Page,
  options: {
    summaries?: unknown[];
    lastUpdate?: string | null;
    devToolsEnabled?: boolean;
    latestRun?: () => unknown;
  } = {},
) {
  const {
    summaries = [],
    lastUpdate = null,
    devToolsEnabled = false,
    latestRun = () => null,
  } = options;

  await page.route(ROUTES.config, (route) =>
    route.fulfill({ json: { devToolsEnabled } }),
  );
  await page.route(ROUTES.areas, (route) => route.fulfill({ json: [] }));
  await page.route(ROUTES.lastUpdate, (route) =>
    route.fulfill({ json: { lastUpdate } }),
  );
  await page.route(ROUTES.summary, (route) => route.fulfill({ json: summaries }));
  await page.route(ROUTES.latestRun, (route) =>
    route.fulfill({ json: latestRun() }),
  );
}
