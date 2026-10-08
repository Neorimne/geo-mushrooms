#!/usr/bin/env bash
# Stops the backend of a running compose stack in the middle of a collection run
# and checks what it leaves behind: it must run unprivileged, exit on SIGTERM
# rather than be killed at the timeout, and give up its run instead of leaving
# it RUNNING for the next process to find. Leaves the backend stopped.
set -euo pipefail

failures=()

if [ "$(docker compose exec -T backend id -u)" = 0 ]; then
  failures+=('the backend runs as root')
fi

# Logged in from inside the container: loopback is its own client to the
# throttler, and api-e2e's last case has just spent the host's login budget.
docker compose exec -T backend node -e '
(async () => {
  const base = "http://localhost:3000";
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  if (!login.ok) throw new Error(`login answered ${login.status}`);
  const { access_token } = await login.json();

  const res = await fetch(`${base}/ingestion/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const run = await res.json();
  if (res.status !== 202 || run.status !== "RUNNING") {
    throw new Error(`no run started: ${res.status} ${JSON.stringify(run)}`);
  }
  console.log(`run #${run.id} started`);
})().catch((e) => { console.error(e.message); process.exit(1); });
'

container=$(docker compose ps -q backend)
docker compose stop -t 20 backend

if [ "$(docker inspect -f '{{.State.ExitCode}}' "$container")" = 137 ]; then
  failures+=('the backend ignored SIGTERM and was killed at the timeout (exit 137)')
fi

run=$(docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "select status, \"errorMessage\" from ingestion_runs order by id desc limit 1"')

if [ "$run" != 'FAILED|Interrupted by a server shutdown' ]; then
  failures+=("the run was not released on shutdown: '$run'")
fi

if [ ${#failures[@]} -gt 0 ]; then
  printf '✗ %s\n' "${failures[@]}" >&2
  exit 1
fi
echo '✓ unprivileged, stopped on SIGTERM, run released'
