import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as reachable without a token.
 *
 * Auth is default-deny: `JwtAuthGuard` is registered as an `APP_GUARD` in
 * `AppModule`, so every route is closed unless it says otherwise, and a new
 * controller is protected on arrival without doing anything. This decorator is
 * the only way to open one, which makes the exceptions greppable — there are
 * exactly two, and `apps/api/src/app.module.spec.ts` fails if a third appears.
 *
 * `POST /auth/login` is not an exception for convenience: it is where tokens
 * come from. Guarding it does not make the application stricter, it makes it
 * impossible to log into, because the client turns a 401 into a logout and the
 * only route back in is the one that just refused.
 *
 * Prefer it on the method rather than the class, so that adding a second route
 * to the same controller does not silently open it too.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
