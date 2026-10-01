import { apiBaseUrl } from './base-url';

const READY_TIMEOUT_MS = 120_000;

/**
 * Waits for the API to answer rather than for a port to open: nginx listens
 * long before the backend has migrated and seeded, and a 502 is not a stack
 * that is up.
 */
module.exports = async function () {
  const url = `${apiBaseUrl()}/config`;
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const ok = await fetch(url)
      .then((res) => res.ok)
      .catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`No API at ${url} after ${READY_TIMEOUT_MS / 1000}s — is the stack up?`);
};
