const baseUrl = () => process.env.API_BASE_URL ?? 'http://localhost:3000';

/**
 * A smoke test against a running API, not a unit test — it needs the stack up
 * (`docker compose up -d`), which is why CI runs the hermetic Playwright suite
 * instead and leaves this one to be run locally.
 *
 * `GET /config` is the only unauthenticated route, which makes it the honest
 * thing to smoke-test: reaching it proves the process booted, connected to
 * Postgres and mapped its routes.
 */
describe('GET /config', () => {
  it('serves the public capability flag without a token', async () => {
    const res = await fetch(`${baseUrl()}/config`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      devToolsEnabled: expect.any(Boolean),
    });
  });

  it('refuses an unauthenticated request to a protected route', async () => {
    const res = await fetch(`${baseUrl()}/cities`);

    expect(res.status).toBe(401);
  });
});
