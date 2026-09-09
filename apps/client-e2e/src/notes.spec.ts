import { test, expect, Page } from '@playwright/test';
import {
  MockNote,
  ROUTES,
  authenticate,
  citySummary,
  mockBaseRoutes,
  observation,
  newestArchiveDayIso,
} from './support/mocks';

/**
 * E2E for the per-day note flow (add → edit → persist → delete).
 *
 * Notes hang off an observation, so they live on the city detail page where
 * the days are listed. Hermetic: a single mutable note is tracked behind the
 * mocked routes so a reload reflects what the API would have persisted.
 */

const CITY_ID = 7;
const CITY = 'Fontebella';
const AREA = 'Val Serena';
const OBSERVATION_ID = 42;

async function setupMocks(page: Page) {
  // Shared, mutable note state — emulates the DB row behind /observations/:id/note.
  const state: { note: MockNote | null } = { note: null };

  const days = () => [
    observation(OBSERVATION_ID, CITY_ID, newestArchiveDayIso(), { note: state.note }),
  ];

  await authenticate(page);
  await mockBaseRoutes(page, {
    summaries: [citySummary(CITY_ID, CITY, AREA, days())],
    lastUpdate: '2026-08-20T08:00:00.000Z',
  });

  await page.route(ROUTES.observations, (route) =>
    route.fulfill({ json: days() }),
  );

  await page.route(ROUTES.note, (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const { text } = route.request().postDataJSON() as { text: string };
      const now = new Date().toISOString();
      state.note = {
        id: 7,
        observationId: OBSERVATION_ID,
        text,
        createdAt: state.note?.createdAt ?? now,
        updatedAt: now,
      };
      return route.fulfill({ json: state.note });
    }
    if (method === 'DELETE') {
      state.note = null;
      return route.fulfill({ json: { deletedCount: 1 } });
    }
    return route.continue();
  });
}

test('note flow: add, edit, persist across reload, delete', async ({ page }) => {
  await setupMocks(page);
  await page.goto(`/city/${CITY_ID}`);

  const row = page.locator('article').first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(newestArchiveDayIso());

  // --- Add ---
  await row.getByRole('button', { name: 'Add a note' }).click();
  const editor = row.getByPlaceholder('Your note for this day');
  await editor.fill('Mushrooms by the river');
  await row.getByRole('button', { name: 'Save' }).click();

  await expect(row.getByText('Mushrooms by the river')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Add a note' })).toHaveCount(0);

  // --- Edit ---
  await row.getByTitle('Edit note').click();
  const editAgain = row.getByPlaceholder('Your note for this day');
  await expect(editAgain).toHaveValue('Mushrooms by the river');
  await editAgain.fill('Porcini by the lake');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByText('Porcini by the lake')).toBeVisible();

  // --- Persistence: a reload re-fetches and the note is still there ---
  await page.reload();
  const rowAfterReload = page.locator('article').first();
  await expect(rowAfterReload.getByText('Porcini by the lake')).toBeVisible();

  // --- Delete ---
  await rowAfterReload.getByTitle('Delete note').click();
  await expect(rowAfterReload.getByText('Porcini by the lake')).toHaveCount(0);
  await expect(rowAfterReload.getByRole('button', { name: 'Add a note' })).toBeVisible();
});

test('a note on a day is flagged on the city card in the list', async ({ page }) => {
  // The list is where the user decides which city to open — a note they wrote
  // has to be discoverable from there.
  const day = observation(OBSERVATION_ID, CITY_ID, newestArchiveDayIso(), {
    note: {
      id: 7,
      observationId: OBSERVATION_ID,
      text: 'Porcini by the lake',
      createdAt: '2026-08-19T10:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
    },
  });

  await authenticate(page);
  await mockBaseRoutes(page, {
    summaries: [citySummary(CITY_ID, CITY, AREA, [day])],
  });

  await page.goto('/');

  const card = page.locator('lib-city-summary-card').first();
  await expect(card.getByLabel('Has a note')).toBeVisible();
});
