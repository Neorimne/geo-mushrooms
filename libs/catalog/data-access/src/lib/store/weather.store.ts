import {
  patchState,
  signalStore,
  withMethods,
  withState,
  withComputed,
} from '@ngrx/signals';
import {
  Area,
  AreaGroup,
  CitySummary,
  DetailRange,
  IngestionRun,
  Observation,
} from '@geo/catalog/util-model';
import { inject, computed } from '@angular/core';
import { WeatherApiService } from '../services/weather-api.service';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, forkJoin, timer, Observable } from 'rxjs';
import { switchMap, takeWhile, tap } from 'rxjs/operators';
import { tapResponse } from '@ngrx/operators';
import { ToastStore } from '@geo/shared/util-toast';

/** How often to ask the backend how the run in flight is doing. */
export const RUN_POLL_INTERVAL_MS = 3000;

/** Trailing window the list view's sparklines cover. */
export const SUMMARY_DAYS = 14;

/** Default window a city's detail view opens on. */
export const DEFAULT_DETAIL_DAYS = 30;

/** First month of the foraging season, matching the backend's backfill. */
const SEASON_START_MONTH = 4;

/** One city's detail view: the window it shows and the days inside it. */
type DetailState = {
  cityId: number;
  from: string;
  to: string;
  range: DetailRange;
  series: Observation[];
  isLoading: boolean;
};

type WeatherState = {
  summaries: CitySummary[];
  areas: Area[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: string | null;
  filterArea: string | null;
  devToolsEnabled: boolean;
  activeRun: IngestionRun | null;
  detail: DetailState | null;
};

const initialState: WeatherState = {
  summaries: [],
  areas: [],
  isLoading: false,
  error: null,
  lastUpdate: null,
  filterArea: null,
  devToolsEnabled: false,
  activeRun: null,
  detail: null,
};

/** 'YYYY-MM-DD' for a date `days` back from today. */
function isoDaysBack(days: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  )
    .toISOString()
    .slice(0, 10);
}

/** The window a range preset covers, ending today. */
export function rangeWindow(range: DetailRange): { from: string; to: string } {
  const to = isoDaysBack(0);

  if (range === 'season') {
    const now = new Date();
    // Before April there is no season yet, so fall back to the last 30 days
    // rather than showing an empty chart.
    const from =
      now.getUTCMonth() + 1 >= SEASON_START_MONTH
        ? `${now.getUTCFullYear()}-${String(SEASON_START_MONTH).padStart(2, '0')}-01`
        : isoDaysBack(DEFAULT_DETAIL_DAYS);
    return { from, to };
  }

  return { from: isoDaysBack(range === '14d' ? 14 : 30), to };
}

export const WeatherStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ summaries, filterArea, activeRun }) => ({
    /** Share of the run's units already attempted, for the progress bar width. */
    runProgressPercent: computed(() => {
      const run = activeRun();
      if (!run || run.totalCities === 0) return 0;
      return Math.round(((run.processed + run.failed) / run.totalCities) * 100);
    }),

    groupedByArea: computed((): AreaGroup[] => {
      const areaFilter = filterArea();
      const list = areaFilter
        ? summaries().filter((s) => s.area.name === areaFilter)
        : summaries();

      const areaMap = new Map<string, AreaGroup>();

      for (const summary of list) {
        const group = areaMap.get(summary.area.name);
        if (group) {
          group.cities.push(summary);
        } else {
          areaMap.set(summary.area.name, {
            name: summary.area.name,
            areaId: summary.area.id,
            cities: [summary],
          });
        }
      }

      return Array.from(areaMap.values())
        .map((group) => ({
          ...group,
          cities: [...group.cities].sort((a, b) =>
            a.city.name.localeCompare(b.city.name),
          ),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }),

    // Unique area names for the filter dropdown
    uniqueAreas: computed(() => {
      const all = summaries().map((s) => s.area.name);
      return [...new Set(all)].sort();
    }),
  })),

  withMethods((store, apiService = inject(WeatherApiService), toastStore = inject(ToastStore)) => {
    /** Pulls the list view's data in. Shared by the initial load and every refresh. */
    const refreshSummaries = () =>
      forkJoin({
        summaries: apiService.getSummaries(SUMMARY_DAYS),
        lastUpdateData: apiService.getLastUpdate(),
      });

    /**
     * A note lives on one observation, which may be on screen twice — once in a
     * city's summary series and once in the open detail view. Both copies are
     * patched so neither goes stale.
     */
    const patchNote = (observationId: number, note: Observation['note']) => {
      const apply = (o: Observation) =>
        o.id === observationId ? { ...o, note } : o;

      const detail = store.detail();

      patchState(store, {
        summaries: store.summaries().map((summary) => ({
          ...summary,
          latest: summary.latest ? apply(summary.latest) : null,
          series: summary.series.map(apply),
        })),
        detail: detail ? { ...detail, series: detail.series.map(apply) } : null,
      });
    };

    return {
      updateAreaFilter(area: string | null) {
        patchState(store, { filterArea: area });
      },
      loadConfig: rxMethod<void>(
        pipe(
          switchMap(() => apiService.getConfig().pipe(
            tapResponse({
              next: ({ devToolsEnabled }) => patchState(store, { devToolsEnabled }),
              error: () => patchState(store, { devToolsEnabled: false }),
            })
          ))
        )
      ),
      loadSummaries: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap(() =>
            refreshSummaries().pipe(
              tapResponse({
                next: ({ summaries, lastUpdateData }) =>
                  patchState(store, {
                    summaries,
                    lastUpdate: lastUpdateData.lastUpdate,
                    isLoading: false,
                  }),
                error: (err: Error) =>
                  patchState(store, { isLoading: false, error: err.message }),
              }),
            ),
          ),
        ),
      ),
      loadAreas: rxMethod<void>(
        pipe(
          switchMap(() => apiService.getAreas().pipe(
            tapResponse({
              next: (areas) => patchState(store, { areas }),
              error: (err: Error) => patchState(store, { error: err.message }),
            })
          ))
        )
      ),
      deleteLatestCity: rxMethod<number>(
        pipe(
          switchMap((cityId) => apiService.deleteLatestCity(cityId).pipe(
            tapResponse({
              next: (res) => toastStore.showSuccess(`Deleted ${res.deletedCount} record(s) for the newest day`),
              error: (err: Error) => toastStore.showError(err.message),
            }),
            switchMap(() =>
              refreshSummaries().pipe(
                tapResponse({
                  next: ({ summaries, lastUpdateData }) =>
                    patchState(store, { summaries, lastUpdate: lastUpdateData.lastUpdate }),
                  error: () => { /* silent — data reload failure shouldn't disrupt UX */ },
                }),
              )
            ),
          ))
        )
      ),
      deleteLatestRegion: rxMethod<number>(
        pipe(
          switchMap((areaId) => apiService.deleteLatestRegion(areaId).pipe(
            tapResponse({
              next: (res) => toastStore.showSuccess(`Deleted ${res.deletedCount} record(s) across the region`),
              error: (err: Error) => toastStore.showError(err.message),
            }),
            switchMap(() =>
              refreshSummaries().pipe(
                tapResponse({
                  next: ({ summaries, lastUpdateData }) =>
                    patchState(store, { summaries, lastUpdate: lastUpdateData.lastUpdate }),
                  error: () => { /* silent — data reload failure shouldn't disrupt UX */ },
                }),
              )
            ),
          ))
        )
      ),
      saveNote: rxMethod<{ observationId: number; text: string }>(
        pipe(
          switchMap(({ observationId, text }) => apiService.upsertNote(observationId, text).pipe(
            tapResponse({
              next: (note) => {
                patchNote(observationId, note);
                toastStore.showSuccess('Note saved');
              },
              error: (err: Error) => toastStore.showError(err.message),
            })
          ))
        )
      ),
      deleteNote: rxMethod<number>(
        pipe(
          switchMap((observationId) => apiService.deleteNote(observationId).pipe(
            tapResponse({
              next: () => {
                patchNote(observationId, null);
                toastStore.showSuccess('Note deleted');
              },
              error: (err: Error) => toastStore.showError(err.message),
            })
          ))
        )
      ),
    };
  }),

  // The detail view has its own block so it can reuse loadSummaries above.
  withMethods((store, apiService = inject(WeatherApiService)) => {
    const fetchDetail = rxMethod<DetailState>(
      pipe(
        tap((detail) => patchState(store, { detail: { ...detail, isLoading: true } })),
        switchMap((detail) =>
          apiService.getObservations(detail.cityId, detail.from, detail.to).pipe(
            tapResponse({
              next: (series) => {
                // A range switched while this request was in flight wins — the
                // response would otherwise paint the previous window's days.
                const current = store.detail();
                if (!current || current.cityId !== detail.cityId || current.from !== detail.from) {
                  return;
                }
                patchState(store, { detail: { ...current, series, isLoading: false } });
              },
              error: (err: Error) => {
                const current = store.detail();
                patchState(store, {
                  error: err.message,
                  detail: current ? { ...current, isLoading: false } : null,
                });
              },
            }),
          ),
        ),
      ),
    );

    const openWithRange = (cityId: number, range: DetailRange) => {
      const { from, to } = rangeWindow(range);
      fetchDetail({ cityId, from, to, range, series: [], isLoading: true });
    };

    return {
      openCityDetail(cityId: number) {
        openWithRange(cityId, '30d');
      },
      setDetailRange(range: DetailRange) {
        const current = store.detail();
        if (!current) return;
        openWithRange(current.cityId, range);
      },
      closeCityDetail() {
        patchState(store, { detail: null });
      },
    };
  }),

  // Collection runs live in their own block so they can reuse loadSummaries
  // above once a run finishes.
  withMethods((store, apiService = inject(WeatherApiService), toastStore = inject(ToastStore)) => {
    /**
     * Follows the run in flight until it leaves RUNNING, then reports how it went
     * and pulls the fresh data in. Safe to call at any time: if nothing is
     * running it settles immediately without a toast.
     */
    const pollActiveRun = rxMethod<void>(
      pipe(
        switchMap(() =>
          timer(0, RUN_POLL_INTERVAL_MS).pipe(
            switchMap(() => apiService.getLatestRun()),
            // Inclusive, so the terminal state is handled before polling stops.
            takeWhile((run) => run?.status === 'RUNNING', true),
            tapResponse({
              next: (run) => {
                if (run?.status === 'RUNNING') {
                  patchState(store, { activeRun: run });
                  return;
                }

                // Only announce a finish we actually watched happen — otherwise a
                // page load would toast the outcome of yesterday's run.
                const wasWatching = store.activeRun() !== null;
                patchState(store, { activeRun: null });
                if (!wasWatching || !run) return;

                if (run.status === 'FAILED') {
                  toastStore.showError(
                    `Collection stopped: ${run.errorMessage ?? 'unknown error'}`,
                  );
                } else if (run.failed > 0) {
                  toastStore.showError(
                    `Collection finished: ${run.processed} of ${run.totalCities} updated, ${run.failed} failed`,
                  );
                } else {
                  toastStore.showSuccess(
                    `Collection finished: ${run.processed} updated`,
                  );
                }

                store.loadSummaries();
              },
              error: () => patchState(store, { activeRun: null }),
            }),
          ),
        ),
      ),
    );

    /**
     * Shared handling for the trigger endpoints. Rejections (409 when a run
     * is already in flight, 400 for an empty scope) are surfaced by authInterceptor.
     */
    const startRun = <T>(
      request: (input: T) => Observable<IngestionRun>,
    ) =>
      rxMethod<T>(
        pipe(
          switchMap((input) =>
            request(input).pipe(
              tapResponse({
                next: (run) => {
                  // Show the run immediately instead of waiting for the first poll.
                  patchState(store, { activeRun: run });
                  pollActiveRun();
                },
                error: () => { /* toasted by authInterceptor */ },
              }),
            ),
          ),
        ),
      );

    return {
      pollActiveRun,
      scrapeNow: startRun<void>(() => apiService.scrapeNow()),
      scrapeCity: startRun<number>((cityId) => apiService.scrapeCity(cityId)),
      scrapeRegion: startRun<number>((areaId) => apiService.scrapeRegion(areaId)),
      backfillSeason: startRun<void>(() => apiService.backfillSeason()),
      createCity: rxMethod<{ name: string; slug: string; areaId?: number | string | null; areaName?: string }>(
        pipe(
          tap(() => patchState(store, { isLoading: true, error: null })),
          switchMap((cityData) =>
            apiService.createCity(cityData).pipe(
              tapResponse({
                next: (city) => {
                  patchState(store, { isLoading: false });
                  toastStore.showSuccess(`${city.name} added — collecting its data now.`);
                  store.loadSummaries();
                  store.loadAreas();
                  // The backend starts a season backfill for the new city — follow it.
                  pollActiveRun();
                },
                error: (err: unknown) => {
                  const errorResponse = err as { error?: { message?: string } };
                  const message = errorResponse?.error?.message || 'Could not add the city';
                  toastStore.showError(message);
                  patchState(store, { isLoading: false, error: message });
                },
              }),
            ),
          ),
        ),
      ),
    };
  }),
);
