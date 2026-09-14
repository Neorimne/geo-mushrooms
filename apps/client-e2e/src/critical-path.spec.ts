import { test, expect } from '@playwright/test';
import {
  ROUTES,
  authenticate,
  citySummary,
  mockBaseRoutes,
  observation,
  newestArchiveDayIso,
} from './support/mocks';

const CITY_ID = 7;
const CITY = 'Fontebella';
const AREA = 'Val Serena';

/** A fortnight of days, ending yesterday — the freshest the archive can be. */
function fortnight() {
  const end = new Date(`${newestArchiveDayIso()}T00:00:00.000Z`);
  return Array.from({ length: 14 }, (_, i) => {
    const day = new Date(end.getTime() - (13 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return observation(100 + i, CITY_ID, day, { tMax: 18 + (i % 5) });
  });
}

test('authenticated user reaches the list, filters it, and opens a city chart', async ({
  page,
}) => {
  const series = fortnight();

  await authenticate(page);
  await mockBaseRoutes(page, {
    summaries: [citySummary(CITY_ID, CITY, AREA, series)],
    lastUpdate: '2026-08-20T08:00:00.000Z',
  });
  await page.route(ROUTES.observations, (route) =>
    route.fulfill({ json: series }),
  );

  await page.goto('/');

  // Past the auth guard the list header renders its title.
  await expect(page.locator('h1')).toContainText('Overview');

  // Only the area filter is left: days are no longer picked from a dropdown of
  // free-form strings, they are browsed on the city's own page.
  const selects = page.locator('select');
  await expect(selects).toHaveCount(1);
  await selects.first().selectOption({ index: 0 });

  // The city card shows the latest day and is marked as fresh.
  const card = page.locator('lib-city-summary-card').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(newestArchiveDayIso());
  await expect(card).toContainText('up to date');
  // The fortnight sparkline is drawn inline, not by a chart library. Named by
  // its component: the card also carries a wind direction arrow, so a bare
  // 'svg' matches two elements and fails Playwright's strict mode.
  await expect(card.locator('lib-sparkline svg')).toBeVisible();

  // --- Open the city's history ---
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/city/${CITY_ID}$`));
  await expect(page.locator('h1')).toContainText(CITY);

  // The detail chart renders as inline SVG with both temperature lines.
  const chart = page.locator('lib-daily-chart svg');
  await expect(chart).toBeVisible();
  await expect(chart.locator('path')).not.toHaveCount(0);
  await expect(page.locator('lib-daily-chart')).toContainText('Max °C');

  // …and the same days are listed underneath, newest first.
  const dayRows = page.locator('article');
  await expect(dayRows.first()).toContainText(newestArchiveDayIso());
});

test('range chips reload the window', async ({ page }) => {
  const series = fortnight();
  const requested: string[] = [];

  await authenticate(page);
  await mockBaseRoutes(page, {
    summaries: [citySummary(CITY_ID, CITY, AREA, series)],
  });
  await page.route(ROUTES.observations, (route) => {
    requested.push(new URL(route.request().url()).searchParams.get('from') ?? '');
    return route.fulfill({ json: series });
  });

  await page.goto(`/city/${CITY_ID}`);
  await expect(page.locator('lib-daily-chart svg')).toBeVisible();

  await page.getByRole('button', { name: 'Season' }).click();

  // A second window was asked for, and it reaches further back than the first.
  await expect.poll(() => requested.length).toBeGreaterThan(1);
  expect(requested[requested.length - 1] < requested[0]).toBe(true);
});
