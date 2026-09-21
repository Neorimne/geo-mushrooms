/**
 * @jest-environment node
 */
import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import { AddressInfo } from 'node:net';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

/**
 * Boots the real `AppModule` over real HTTP — the only spec in the repo that
 * does. Everything else here builds an isolated module with hand-stubbed
 * dependencies, which is why nothing until now could notice that the
 * application as a whole is fail-open: `JwtAuthGuard` is applied controller by
 * controller, so a controller that forgets it is simply public.
 *
 * `ProbeController` is that forgotten controller, written deliberately. It
 * declares no guard and no decorator of any kind, which is exactly what a
 * controller added next week will look like.
 *
 * Note what this spec does NOT set up: the global `ValidationPipe`, `helmet`
 * and CORS all live in `main.ts` and are not applied here. This is a test of
 * module wiring and guards, not of bootstrap. (One visible consequence: with no
 * `ValidationPipe`, a malformed login body reaches the handler and answers 401
 * `Invalid credentials` rather than 400 — which is why the login case below
 * sends real credentials and expects a real token.)
 */

// Must beat `SeedService.onModuleInit`, which is on by default in the local
// `.env`. Assigning to `process.env` wins over a loaded `.env`, and the fake
// `city.count()` below returns 1 so the seeder stops at its second guard even
// if this line is ever lost.
process.env.SEED_DEMO_DATA = 'false';
// `JwtModule.registerAsync` throws at boot without this, and CI has no `.env`.
process.env.JWT_SECRET = 'default-deny-spec-secret';

const ADMIN = { id: 1, email: 'admin@probe.test', password: 'probe-password' };

@Controller('__probe')
class ProbeController {
  @Get()
  probe(@Req() request: Request & { user?: unknown }) {
    return { user: request.user ?? null };
  }
}

describe('AppModule — default-deny auth', () => {
  let app: INestApplication;
  let base: string;

  const prisma = {
    user: { findUnique: jest.fn() },
    // The seeder is off, but if it ever ran it would stop here rather than
    // inventing a demo dataset inside a unit test.
    city: { count: jest.fn().mockResolvedValue(1) },
    // `IngestionService.onModuleInit` reaps expired leases and this is its only
    // boot-time database call.
    ingestionRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };

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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    // Port 0 for an ephemeral port: no collision with a running `nx serve api`
    // or with a parallel jest worker. The port is read off the server because
    // `app.getUrl()` answers `http://[::1]:PORT` on some hosts.
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
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
  });

  describe('the routes it does not', () => {
    it('refuses GET /cities without a token', async () => {
      expect((await get('/cities')).status).toBe(401);
    });

    it('closes a controller that declares no guard', async () => {
      expect((await get('/__probe')).status).toBe(401);
    });
  });
});
