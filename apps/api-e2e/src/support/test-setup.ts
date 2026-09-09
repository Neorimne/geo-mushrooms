/**
 * Where the suite expects the API to be listening. Node 22 has `fetch` built in,
 * so these tests need no HTTP client dependency of their own.
 */
module.exports = async function () {
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '3000';
  process.env.API_BASE_URL = `http://${host}:${port}`;
};
