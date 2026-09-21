import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * The token verifier had no spec at all while the ingestion engine had 28
 * tests — in an application whose entire surface it decides. Now that it is
 * the global guard, every route in the app answers to what is asserted here.
 */
describe('JwtAuthGuard', () => {
  const routeHandler = function getThing() {
    /* a route handler, only ever compared by identity */
  };
  class RouteController {}

  const makeContext = (authorization?: string) => {
    const request: { headers: { authorization?: string }; user?: unknown } = {
      headers: authorization === undefined ? {} : { authorization },
    };

    const context = {
      getHandler: () => routeHandler,
      getClass: () => RouteController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    return { context, request };
  };

  const makeGuard = (
    options: { isPublic?: boolean; verify?: jest.Mock; secret?: string } = {},
  ) => {
    const { isPublic, verify = jest.fn() } = options;
    // Read by presence, not by default parameter: a default would swallow an
    // explicit `secret: undefined`, which is the case worth testing.
    const secret = 'secret' in options ? options.secret : 'the-configured-secret';

    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
    const jwtService = { verifyAsync: verify } as unknown as JwtService;
    const configService = {
      get: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService;

    return {
      guard: new JwtAuthGuard(reflector, jwtService, configService),
      reflector,
      verify,
      configService,
    };
  };

  describe('a route marked @Public()', () => {
    it('is served without a token', async () => {
      const { guard } = makeGuard({ isPublic: true });
      const { context } = makeContext();

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('is not verified even when a token happens to be present', async () => {
      // Someone whose session just expired still has a token in localStorage.
      // A public route has to behave the same way either way.
      const { guard, verify } = makeGuard({ isPublic: true });
      const { context } = makeContext('Bearer a-stale-token');

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(verify).not.toHaveBeenCalled();
    });

    it('never hands the handler an identity nothing verified', async () => {
      const { guard } = makeGuard({ isPublic: true });
      const { context, request } = makeContext('Bearer a-stale-token');

      await guard.canActivate(context);

      expect(request.user).toBeUndefined();
    });
  });

  it('looks for the marker on the handler and on the class, in that order', async () => {
    // Handler-only would ignore a controller opened as a whole; class-only
    // would ignore GET /config and POST /auth/login, which are both methods.
    // Pinning the array is what stops a later "simplify" to get().
    const { guard, reflector } = makeGuard({ isPublic: true });
    const { context } = makeContext();

    await guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      routeHandler,
      RouteController,
    ]);
  });

  describe('a route that is not marked', () => {
    it.each([
      undefined,
      '',
      'Bearer',
      'Bearer ',
      'bearer a-token',
      'Basic a-token',
      'Token a-token',
    ])('refuses the request (fail-closed) when the header is %p', async (authorization) => {
      const { guard, verify } = makeGuard();
      const { context } = makeContext(authorization);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('No token provided'),
      );
      expect(verify).not.toHaveBeenCalled();
    });

    it('verifies a Bearer token against the configured secret', async () => {
      const verify = jest.fn().mockResolvedValue({ email: 'a@b.test', sub: 7 });
      const { guard, configService } = makeGuard({ verify });
      const { context } = makeContext('Bearer a-token');

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
      expect(verify).toHaveBeenCalledWith('a-token', {
        secret: 'the-configured-secret',
      });
    });

    it('hands the verified payload to the handler', async () => {
      const payload = { email: 'a@b.test', sub: 7 };
      const { guard } = makeGuard({ verify: jest.fn().mockResolvedValue(payload) });
      const { context, request } = makeContext('Bearer a-token');

      await guard.canActivate(context);

      expect(request.user).toEqual(payload);
    });

    it('refuses a token it cannot verify, and says which failure it was', async () => {
      // The two messages stay distinct: an operator reading a 401 needs to
      // know whether a token was missing or rejected.
      const { guard } = makeGuard({
        verify: jest.fn().mockRejectedValue(new Error('jwt expired')),
      });
      const { context } = makeContext('Bearer an-expired-token');

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired token'),
      );
    });

    it('still refuses when JWT_SECRET is missing, rather than skipping the check', async () => {
      // JwtModule fails at boot without a secret, but this guard reads it
      // separately — a missing secret must never become a waved-through route.
      const verify = jest.fn().mockRejectedValue(new Error('secretOrPrivateKey must have a value'));
      const { guard } = makeGuard({ verify, secret: undefined });
      const { context } = makeContext('Bearer a-token');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(verify).toHaveBeenCalledWith('a-token', { secret: undefined });
    });
  });
});
