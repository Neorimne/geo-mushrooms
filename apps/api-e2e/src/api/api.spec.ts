const baseUrl = () => process.env.API_BASE_URL ?? 'http://localhost:3000';

/**
 * A smoke test against a running API, not a unit test — it needs the stack up
 * (`docker compose up -d`), which is why CI runs the hermetic Playwright suite
 * instead and leaves this one to be run locally.
 *
 * Auth is default-deny — one global guard — and exactly two routes exempt
 * themselves with `@Public()`: `GET /config` and `POST /auth/login`. Both are
 * smoke-tested here, because a route that nothing calls is how this comment
 * came to name only one of them in the first place.
 *
 * Reaching `/config` proves the process booted, connected to Postgres and
 * mapped its routes.
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

/**
 * The route default-deny would close by accident. A guarded login is not a
 * stricter application but an unusable one: the client answers a 401 by
 * logging out, so the only way back in is the request that just refused.
 */
describe('POST /auth/login', () => {
  it('reaches the login handler without a token', async () => {
    const res = await fetch(`${baseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
    });

    // Wrong credentials on purpose — this asserts the route is reachable, not
    // that any particular account exists. 401 "Invalid credentials" is the
    // handler answering; the guard would never have let it run.
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ message: 'Invalid credentials' });
  });
});
