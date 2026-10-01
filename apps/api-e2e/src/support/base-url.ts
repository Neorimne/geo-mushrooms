/**
 * The API as a visitor reaches it: through nginx on the compose stack's port,
 * so the proxy is under test too. Nx exports the root `.env`, which is where
 * `HTTP_PORT` comes from; set `API_BASE_URL` to aim anywhere else.
 */
export const apiBaseUrl = (): string =>
  process.env.API_BASE_URL ??
  `http://localhost:${process.env.HTTP_PORT ?? '80'}/api`;
