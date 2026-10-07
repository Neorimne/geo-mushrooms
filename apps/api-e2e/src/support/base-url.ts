/**
 * The app as a visitor reaches it: through nginx on the compose stack's port,
 * so the proxy is under test too. Nx exports the root `.env`, which is where
 * `HTTP_PORT` comes from; set `APP_BASE_URL` to aim anywhere else.
 */
export const appBaseUrl = (): string =>
  process.env.APP_BASE_URL ?? `http://localhost:${process.env.HTTP_PORT ?? '80'}`;

/** The API behind nginx's `/api/` prefix. `API_BASE_URL` overrides it alone. */
export const apiBaseUrl = (): string =>
  process.env.API_BASE_URL ?? `${appBaseUrl()}/api`;
