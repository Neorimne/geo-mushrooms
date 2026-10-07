import { apiBaseUrl, appBaseUrl } from '../support/base-url';

/**
 * A smoke test against the running stack (`docker compose up -d`), not a unit
 * test. It is the one place the database, the migrations, the seed, nginx and
 * `main.ts` are exercised together, which is why CI brings the stack up for it.
 *
 * Auth is default-deny — one global guard — and exactly two routes exempt
 * themselves with `@Public()`: `GET /config` and `POST /auth/login`. Both are
 * smoke-tested here, because a route that nothing calls is how this comment
 * came to name only one of them in the first place.
 */
describe('GET /config', () => {
  it('serves the public capability flag without a token', async () => {
    const res = await fetch(`${apiBaseUrl()}/config`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      devToolsEnabled: expect.any(Boolean),
    });
  });

  it('refuses an unauthenticated request to a protected route', async () => {
    const res = await fetch(`${apiBaseUrl()}/cities`);

    expect(res.status).toBe(401);
  });
});

const login = (body: Record<string, unknown>) =>
  fetch(`${apiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * The route default-deny would close by accident. A guarded login is not a
 * stricter application but an unusable one: the client answers a 401 by
 * logging out, so the only way back in is the request that just refused.
 */
describe('POST /auth/login', () => {
  it('reaches the login handler without a token', async () => {
    const res = await login({
      email: 'nobody@example.com',
      password: 'wrong-password',
    });

    // Wrong credentials on purpose — this asserts the route is reachable, not
    // that any particular account exists. 401 "Invalid credentials" is the
    // handler answering; the guard would never have let it run.
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ message: 'Invalid credentials' });
  });

  it('rejects fields the DTO does not declare', async () => {
    const res = await login({
      email: 'nobody@example.com',
      password: 'wrong-password',
      isAdmin: true,
    });

    expect(res.status).toBe(400);
  });
});

/**
 * Proves the database end to end: the seeded admin can log in, and the seeded
 * cities come back. Credentials come from the root `.env`, which Nx exports.
 */
describe('the seeded stack', () => {
  it('logs the seeded admin in and serves the seeded cities', async () => {
    const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
    if (!email || !password) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set (see .env.example)');
    }

    const res = await login({ email, password });
    expect(res.status).toBe(201);
    const { access_token } = (await res.json()) as { access_token: string };

    const cities = await fetch(`${apiBaseUrl()}/cities`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(cities.status).toBe(200);
    expect(((await cities.json()) as unknown[]).length).toBeGreaterThan(0);
  });
});

/**
 * helmet covers the API's JSON; the document that runs the scripts is nginx's
 * to protect. Its script policy is a `<meta>` CSP the client build hashes
 * (`security.autoCsp`), because only the build knows the inline scripts. The
 * header carries what a `<meta>` CSP cannot, `frame-ancestors`.
 */
describe('the HTML document', () => {
  // `/city/1` is no file on disk: nginx answers it through the SPA fallback,
  // a second pass through `location /` that must carry the headers too.
  it.each(['/', '/city/1'])('serves %s with the security headers', async (path) => {
    const res = await fetch(`${appBaseUrl()}${path}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('carries a script policy hashed at build time', async () => {
    const html = await (await fetch(appBaseUrl())).text();

    expect(html).toMatch(
      /<meta http-equiv="Content-Security-Policy" content="script-src [^"]*'sha256-/,
    );
  });

  it('does not name the nginx version', async () => {
    const res = await fetch(appBaseUrl());

    expect(res.headers.get('server')).toBe('nginx');
  });

  // The document's headers must not leak onto the API, which has helmet's.
  // Two sources would arrive merged, as `SAMEORIGIN, DENY`.
  it('leaves the API to helmet', async () => {
    const res = await fetch(`${apiBaseUrl()}/config`);

    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
});
