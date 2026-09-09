import { test, expect, Page } from '@playwright/test';
import {
  ROUTES,
  authenticate,
  citySummary,
  mockBaseRoutes,
  observation,
  newestArchiveDayIso,
} from './support/mocks';

/**
 * E2E for the collection-run progress strip (start → advance → finish).
 *
 * Hermetic, in the same style as notes.spec.ts: the backend is mocked via route
 * interception, and a mutable run is stepped forward one city at a time so the
 * polling in WeatherStore has something real to follow.
 */

interface MockRun {
  id: number;
  trigger: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  scopeLabel: string;
  totalCities: number;
  processed: number;
  failed: number;
  currentCity: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const AREA = 'Val Serena';
const CITIES = ['Fontebella', 'Pietralta', 'Verdolo', 'Rocchetta'];

async function setupMocks(page: Page) {
  const state: { run: MockRun | null } = { run: null };

  await authenticate(page);
  await mockBaseRoutes(page, {
    summaries: [
      citySummary(1, CITIES[0], AREA, [
        observation(1, 1, newestArchiveDayIso()),
      ]),
    ],
    lastUpdate: '2026-08-05T08:00:00.000Z',
    latestRun: () => state.run,
  });

  await page.route(ROUTES.regionRun, (route) => {
    state.run = {
      id: 1,
      trigger: 'MANUAL_REGION',
      status: 'RUNNING',
      scopeLabel: AREA,
      totalCities: CITIES.length,
      processed: 0,
      failed: 0,
      currentCity: CITIES[0],
      errorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    return route.fulfill({ status: 202, json: state.run });
  });

  return {
    /** Advances the mocked run by one city, closing it after the last one. */
    completeNextCity() {
      const run = state.run;
      if (!run) return;
      run.processed += 1;
      if (run.processed >= run.totalCities) {
        run.status = 'COMPLETED';
        run.currentCity = null;
        run.finishedAt = new Date().toISOString();
      } else {
        run.currentCity = CITIES[run.processed];
      }
    },
  };
}

test('region run: progress strip appears, advances, and clears on completion', async ({ page }) => {
  const backend = await setupMocks(page);
  await page.goto('/');

  const progress = page.getByTestId('run-progress');
  await expect(progress).toHaveCount(0);

  // --- Start the run from the area header ---
  await page.getByTitle('Collect data for this region').first().click();
  await page.getByRole('button', { name: 'Collect', exact: true }).click();

  await expect(progress).toBeVisible();
  await expect(progress).toContainText(AREA);
  await expect(progress).toContainText(`0 / ${CITIES.length}`);
  await expect(progress).toContainText(CITIES[0]);

  // Triggers stay disabled for as long as a run holds the lock.
  await expect(page.getByTitle('Collect data for this region').first()).toBeDisabled();

  // --- Advance city by city; polling picks each step up ---
  backend.completeNextCity();
  await expect(progress).toContainText(`1 / ${CITIES.length}`);
  await expect(progress).toContainText(CITIES[1]);

  backend.completeNextCity();
  await expect(progress).toContainText(`2 / ${CITIES.length}`);

  // --- Finish ---
  backend.completeNextCity();
  backend.completeNextCity();

  await expect(progress).toHaveCount(0);
  await expect(page.getByTitle('Collect data for this region').first()).toBeEnabled();
});
