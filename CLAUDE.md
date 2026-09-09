# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project Overview

**Geo Mushrooms** reads a **daily historical weather archive** for a set of alpine towns,
stores one row per city per day, and charts it per city and per region so a forager can
judge the conditions themselves.

**The archive is synthetic.** `SyntheticArchiveProvider` generates it in-process, so the
project runs with no third-party account, key or rate limit. It is a real adapter, not a
stub: it implements the same `ArchiveProvider` contract a network-backed source would,
honours the same publication lag and raises the same errors.

**The archive stops at D-3.** Daily archives withhold their most recent days while they
are validated, so what is published runs up to *three days ago*. That single fact shapes
the schema (`date` is a calendar day, not a timestamp), the run planner (it anchors on the
archive's edge, never the calendar's) and the UI (a city is "up to date" when its latest
day *is* that edge). Reading the edge as *yesterday* marks every city stale for ever — the
same false alarm as reading it as *today*, one step further along. The lag lives in one
constant, `ARCHIVE_VALIDATION_DAYS`, mirrored in `ingestion.constants.ts` and
`observation.model.ts` because an Angular library cannot import from a Nest app.

## Commands

All commands run from the workspace root. Use `npx nx` as the task runner.

> **Node 22 and npm 11 are required.** Angular 22 declares
> `engines: node ^22.22.3 || ^24.15.0 || >=26.0.0`, so Node 20 no longer works.
>
> npm is a separate pin: `node:22-alpine` still ships **npm 10.9**, and
> `package-lock.json` is an npm 11 artifact, so npm 10 builds a different tree from it and
> fails `npm ci` with a misleading "lockfile out of sync" error naming packages that have
> nothing to do with the problem. The `Dockerfile` and both `ci.yml` jobs run
> `npm install -g npm@11` before `npm ci`; any new environment must do the same.
>
> **Never regenerate `package-lock.json` — update it.** A lockfile rebuilt on Windows
> silently drops every non-win32 optional binary, which breaks `npm ci` inside
> `node:22-alpine` and on the CI runner with an error that looks unrelated. A plain
> `npm install` updates the lock in place and keeps every platform's entries.

### Development
```sh
npx nx serve api          # NestJS backend (http://localhost:3000)
npx nx serve client       # Angular frontend (http://localhost:4200)
```

### Testing and linting
```sh
npx nx run-many -t test                 # unit tests, all projects
npx nx test <project>                   # e.g. api, ui-chart, catalog-data-access
npx nx e2e client-e2e                   # Playwright, hermetic
npx nx e2e api-e2e                      # smoke test — needs the stack running
npx nx run-many -t lint
```

### Prisma (always include `--schema` in the monorepo)
```sh
npx prisma migrate dev --name <name> --schema=./apps/api/prisma/schema.prisma
npx prisma db seed
npx prisma studio --schema=./apps/api/prisma/schema.prisma
```

### Docker
```sh
docker compose up -d                    # the whole stack, seeded
docker compose down -v                  # nuclear reset (deletes data, reseeds on next up)
```

## Architecture

### Monorepo layout
```
apps/
  api/           NestJS backend
  api-e2e/       Smoke tests against a running stack (not in CI)
  client/        Angular 22 frontend
  client-e2e/    Playwright E2E (hermetic — route interception, no backend)
libs/
  auth/          data-access (AuthStore, guard, interceptor) + feature-login
  catalog/       data-access + feature-list + feature-city-detail + ui-card + ui-chart
  shared/        ui-toast
```

Libraries are layered `data-access` / `feature-*` / `ui-*` behind `@geo/*` aliases. Apps
never import from each other; `libs/` are the only shared units, enforced by Nx.

### The provider seam — read this before touching ingestion

Everything the run does is independent of *where* the days come from. `ArchiveProvider`
(`apps/api/src/ingestion/archive-provider.ts`) is the whole of what it needs:

```ts
openSession(slug)                              // per-run handshake
resolveLocality(slug)                          // slug -> the source's own id
fetchMonth(session, localityId, month, slug)   // one month, already ParsedDay[]
```

Three things make it hold, and each is easy to undo by accident:

- **`ParsedDay` is the currency, not a payload.** `fetchMonth` returns normalised days, so
  parsing is a provider concern and the run never learns any source's shape. Returning raw
  JSON would put the parser back in the orchestrator.
- **`ArchiveSession` is opaque.** A source that authenticates per run keeps its key there.
  Threading such a value through the run as a bare `string` puts one source's
  implementation detail in the signature of every collection step, and leaves a source
  without a handshake nothing honest to pass.
- **`RateLimitError` / `KeyExtractionError` / `PayloadShapeError` are shared vocabulary**,
  not adapter internals: the run reacts to them by name, and any provider may raise them.

`ARCHIVE_VALIDATION_DAYS` is likewise shared — any provider must honour the edge.
`REQUEST_DELAY_MS` and `MONTH_REQUEST_DELAY_MS` are the opposite: they exist for a source
with a rate limit and mean nothing to one without.

**Nothing outside `ingestion/sources/<name>/` may name a source.** If a change wants to put
a provider's name, path, header or error text into `IngestionService`, `CitiesService` or
the client, the seam is being bypassed.

### Backend (NestJS + Prisma)
- Feature modules; all endpoints behind `JwtAuthGuard` except `GET /config`.
- **`IngestionService`** — cron plus manual triggers. Plans a run as city-months and
  upserts every returned day on `(cityId, date)`. Holds no knowledge of any source.
- **Collection runs** — every trigger records an `IngestionRun` and updates counters unit
  by unit. Only one may be `RUNNING` (`409` otherwise); rows left `RUNNING` by a crashed
  process are closed on startup.
- **`SeedService`** — writes the demo dataset when `SEED_DEMO_DATA=true` *and* the database
  has no cities. Fail-closed, and never touches a database that already has data.
- **Rate limiting** — 100 requests/minute globally via `ThrottlerModule`.

### Database schema
```
Area (1) → (many) City (1) → (many) DailyObservation (1) → (1) Note
User         (standalone — authentication only)
IngestionRun (standalone — one collection run and its progress counters)
```

- `DailyObservation` is keyed `@@unique([cityId, date])`, which is what makes re-collecting
  a month idempotent and self-healing.
- **Every metric column is nullable.** One unparsable field must never cost the whole day.
  `0` is a real reading; `null` means "not measured". Never conflate them.
- `date` is `@db.Date`: build it as `new Date('YYYY-MM-DDT00:00:00.000Z')` and serialise it
  back with `.toISOString().slice(0, 10)`.
- **Precipitation carries its own unit.** `precipUnit` is `"cm"` on a snow day and `"mm"`
  otherwise, so amount and unit are stored together and the UI labels the value from the
  stored unit. Collapsing them into one "mm" column would mix centimetres of snow into
  millimetres of rain.
- **Wind is stored in knots**, as sources publish it, and converted in `windSpeedKmh()` at
  the point of display. Converting on the way in would leave the stored number disagreeing
  with the source it came from.
- `IngestionRun.totalCities` / `currentCity` are **legacy names**: a run's unit is a city
  on the daily pass but a city-month on a backfill, so `currentCity` may read
  `"Pietralta — 2026-05"`.

### Frontend (Angular 22)
- **Standalone components** throughout — no NgModules.
- **Zoneless change detection** (`provideZonelessChangeDetection()`).
- **NgRx Signals** (`@ngrx/signals`) — `WeatherStore` and `AuthStore` are root `signalStore`s.
- **Charts are hand-rolled SVG**, not a library. `libs/catalog/ui-chart` maps
  `Observation[]` to path/rect coordinates in computed signals and binds them
  declaratively: OnPush + zoneless work without redraw plumbing, dark mode is Tailwind
  classes on SVG elements, and the coordinate maths is unit-tested. Do not add a charting
  dependency without a reason this cannot cover.
- The city detail route (`city/:id`) is **lazy**; route params arrive as signal inputs via
  `withComponentInputBinding()`.
- **Tailwind CSS** for all styling; dark mode via the class-based strategy.

## Coding conventions

### Universal
- **No `any`.** Use explicit interfaces and Prisma-generated types.
- **`schema.prisma` is the single source of truth** — never define parallel interfaces
  duplicating Prisma models.
- **Nx boundaries** — `apps/` cannot import from each other; circular dependencies are
  forbidden.
- Every project compiles with `strict`, libraries included.

### Backend
- Never use `process.env` directly — inject `ConfigService`. For module options needing
  secrets (`JwtModule`, `ThrottlerModule`), use `registerAsync`. Fallback hardcoded secrets
  (`|| 'secret'`) are strictly forbidden.
- **Ingestion resilience** — every external call and every parse in a `try/catch`.
  Distinguish *systemic* failures from *per-unit* ones: `RateLimitError`,
  `KeyExtractionError` and `PayloadShapeError` must propagate; anything else costs one
  city-month and the run carries on. A single bad field nulls that column only — never drop
  the day.
- **Idempotency** — always `upsert` on `(cityId, date)`. Re-running a month must converge.
- **Validation** — `class-validator` DTOs; the global `ValidationPipe` keeps
  `whitelist: true` and `forbidNonWhitelisted: true`.
- **Security** — `helmet` stays active; CORS origins come from `FRONTEND_URL`.

### Frontend — forbidden patterns
- `@Input()` / `@Output()` / `@HostBinding` / `@HostListener` → use `input()`, `output()`,
  `model()`, and the `host` object.
- `async` pipe in templates → use signals.
- `ngClass` / `ngStyle` → use `[class.name]` and `[style.prop]`.
- Constructor-based DI → use `inject()`.
- `standalone: true` in `@Component` (the default since v20).
- NgModules.
- RxJS outside `rxMethod` for HTTP. Use `.update()` / `.set()`, never `.mutate()`.
- `*ngIf` / `*ngFor` → use `@if` / `@for` / `@switch`.
- OnPush is the default in Angular 22, so a component declaring no strategy already has it.
  Never write `Eager` (or its deprecated alias `Default`) without a stated reason — an
  `nx migrate` run will offer to add it to components predating v22; decline.
- Mobile-first. This app is used on a phone.

### Adding an environment variable
Update **both** in the same change: `docker-compose.yml` and `.env.example`.
