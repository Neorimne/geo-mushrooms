/**
 * @jest-environment node
 */
import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { AddressInfo } from 'node:net';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/public.decorator';

/**
 * Boots the real `AppModule` over real HTTP — the only spec in the repo that
 * does. Everything else builds an isolated module with hand-stubbed
 * dependencies, which is why nothing could previously notice that the
 * application as a whole was fail-open: `JwtAuthGuard` was applied controller
 * by controller, so a controller that forgot it was simply public.
 *
 * `ProbeController` is that forgotten controller, written deliberately. It
 * declares no guard and no decorator of any kind — exactly what a controller
 * added next week will look like — and it is closed anyway. That is the whole
 * claim, and it is not provable anywhere but here.
 *
 * It applies `configureApp` exactly as `bootstrap()` does, so the pipes, helmet
 * and CORS under test are the ones that ship.
 */

// Must beat `SeedService.onModuleInit`, which is on by default in the local
// `.env`. Assigning to `process.env` wins over a loaded `.env`, and the fake
// `city.count()` below returns 1 so the seeder stops at its second guard even
// if this line is ever lost.
process.env.SEED_DEMO_DATA = 'false';
// `JwtModule.registerAsync` throws at boot without this, and CI has no `.env`.
process.env.JWT_SECRET = 'default-deny-spec-secret';
process.env.FRONTEND_URL = 'http://client.probe.test';

const ADMIN = { id: 1, email: 'admin@probe.test', password: 'probe-password' };

@Controller('__probe')
class ProbeController {
  @Get()
  probe(@Req() request: Request & { user?: unknown }) {
    return { user: request.user ?? null };
  }
}

/**
 * The class-level half of `@Public()`. No production route uses it — both real
 * exemptions are on methods — so without this the guard's `getClass()` target
 * would be asserted only by a comment nobody can check.
 */
@Public()
@Controller('__probe/public')
class PublicProbeController {
  @Get()
  probe(@Req() request: Request & { user?: unknown }) {
    return { user: request.user ?? null };
  }
}

const prisma = {
  user: { findUnique: jest.fn() },
  // The seeder is off, but if it ever ran it would stop here rather than
  // inventing a demo dataset inside a unit test.
  city: { count: jest.fn().mockResolvedValue(1) },
  area: { findMany: jest.fn().mockResolvedValue([]) },
  // `IngestionService.onModuleInit` reaps expired leases and this is its only
  // boot-time database call.
  ingestionRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
};

/**
 * Boots the application as `bootstrap()` does. Each call is a separate app
 * with its own throttler storage, so one describe cannot drain another's
 * request budget.
 */
async function boot(): Promise<{ app: INestApplication; base: string }> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController, PublicProbeController],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  // Port 0 for an ephemeral port: no collision with a running `nx serve api`
  // or with a parallel jest worker. The port is read off the server because
  // `app.getUrl()` answers `http://[::1]:PORT` on some hosts.
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, base: `http://127.0.0.1:${port}` };
}

describe('AppModule — default-deny auth', () => {
  let app: INestApplication;
  let base: string;

  const get = (path: string, token?: string) =>
    fetch(`${base}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  const login = (email: string, password: string) =>
    fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

  beforeAll(async () => {
    // Real bcrypt, not a mock: the point of the login case is that the actual
    // login path still works. Cost 4 keeps it a few milliseconds.
    const hashed = await bcrypt.hash(ADMIN.password, 4);
    prisma.user.findUnique.mockResolvedValue({
      id: ADMIN.id,
      email: ADMIN.email,
      password: hashed,
    });

    ({ app, base } = await boot());
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('the routes the application opens on purpose', () => {
    it('serves GET /config without a token', async () => {
      const res = await get('/config');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ devToolsEnabled: expect.any(Boolean) });
    });

    // The trap. Making auth default-deny silently closes this route, and a
    // closed login is not a degraded application but an unusable one: the
    // client's interceptor turns any 401 into a logout, so the only way in
    // would be the way that just 401'd.
    it('lets POST /auth/login through and returns a token', async () => {
      const res = await login(ADMIN.email, ADMIN.password);

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ access_token: expect.any(String) });
    });

    it('serves a class-level @Public() route, and tells it nothing about a caller', async () => {
      const res = await get('/__probe/public');

      expect(res.status).toBe(200);
      // A public handler must never be handed an identity nothing verified.
      expect(await res.json()).toEqual({ user: null });
    });
  });

  describe('the routes it does not', () => {
    it('refuses GET /cities without a token', async () => {
      expect((await get('/cities')).status).toBe(401);
    });

    it('closes a controller that declares no guard', async () => {
      expect((await get('/__probe')).status).toBe(401);
    });

    // AreasController carries no auth decorator of any kind any more. This is
    // the headline: it is closed by the application's default, not by anything
    // written in the file.
    it('closes GET /areas, which no longer names a guard at all', async () => {
      expect((await get('/areas')).status).toBe(401);
    });

    // A dev-tools route needs both checks, and the order matters: an anonymous
    // caller is refused for being anonymous, and cannot learn from a 403
    // whether dev tools happen to be enabled in this deployment.
    it('answers a dev-tools route 401 rather than 403 when there is no token', async () => {
      const res = await fetch(`${base}/observations/latest/city/1`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });

  // What `configureApp` adds on top of the module. Without these the spec would
  // boot a different application from the one that ships.
  describe('the bootstrap pipeline', () => {
    it('rejects a body with fields the DTO does not declare', async () => {
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ADMIN, isAdmin: true }),
      });

      expect(res.status).toBe(400);
    });

    it('sends the helmet headers', async () => {
      const res = await get('/config');

      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('allows the configured origin', async () => {
      const res = await fetch(`${base}/config`, {
        headers: { Origin: 'http://client.probe.test' },
      });

      expect(res.headers.get('access-control-allow-origin')).toBe(
        'http://client.probe.test',
      );
    });
  });

  describe('with a token', () => {
    let token: string;

    beforeAll(async () => {
      const res = await login(ADMIN.email, ADMIN.password);
      ({ access_token: token } = (await res.json()) as { access_token: string });
    });

    // Default-deny, not deny-everything: the same route the case above refused
    // has to open for a valid token, or the guard is just a wall.
    it('opens GET /areas', async () => {
      expect((await get('/areas', token)).status).toBe(200);
    });

    it('hands the verified payload to the handler', async () => {
      const res = await get('/__probe', token);

      expect(res.status).toBe(200);
      // Every future handler reads the caller from here.
      expect(await res.json()).toEqual({
        user: expect.objectContaining({ email: ADMIN.email, sub: ADMIN.id }),
      });
    });

    it('refuses a token it cannot verify', async () => {
      expect((await get('/cities', 'not-a-real-token')).status).toBe(401);
    });
  });
});

/**
 * nginx is the only way into the stack, so every request reaches Nest from
 * nginx's address. Unless the app trusts the hop nginx appends to
 * `X-Forwarded-For`, the throttler sees one client: everyone shares a single
 * budget, and one visitor can spend it for all of them.
 *
 * The test client plays nginx here, sending the header nginx would.
 */
describe('AppModule — throttling behind the proxy', () => {
  // The global limit in `app.module.ts`.
  const LIMIT = 100;

  const from = (base: string, forwardedFor: string) =>
    fetch(`${base}/config`, { headers: { 'X-Forwarded-For': forwardedFor } });

  // One at a time: a hundred sockets at once is a load test, not this one.
  const spend = async (base: string, forwardedFor: (i: number) => string) => {
    for (let i = 0; i < LIMIT; i++) {
      await from(base, forwardedFor(i));
    }
  };

  describe('with TRUST_PROXY=1', () => {
    let app: INestApplication;
    let base: string;

    beforeAll(async () => {
      process.env.TRUST_PROXY = '1';
      ({ app, base } = await boot());
    });

    afterAll(async () => {
      delete process.env.TRUST_PROXY;
      await app?.close();
    });

    it('gives each forwarded client its own budget', async () => {
      await spend(base, () => '10.0.0.1');

      expect((await from(base, '10.0.0.1')).status).toBe(429);
      expect((await from(base, '10.0.0.2')).status).toBe(200);
    });

    // nginx appends the address it saw, so only the last entry is its word.
    // Everything before it is whatever the client chose to send — keying on
    // that would sell a fresh budget to anyone who asks for one.
    it('keys on the hop the proxy appended, not on what the client claimed', async () => {
      await spend(base, (i) => `198.51.100.${i}, 10.0.0.3`);

      expect((await from(base, '203.0.113.7, 10.0.0.3')).status).toBe(429);
    });
  });

  // `nx serve api` has no proxy in front of it, so there the header is the
  // client's own claim and must be ignored.
  describe('without TRUST_PROXY', () => {
    let app: INestApplication;
    let base: string;

    beforeAll(async () => {
      ({ app, base } = await boot());
    });

    afterAll(async () => {
      await app?.close();
    });

    it('ignores X-Forwarded-For', async () => {
      await spend(base, () => '10.0.0.4');

      expect((await from(base, '10.0.0.5')).status).toBe(429);
    });
  });
});
