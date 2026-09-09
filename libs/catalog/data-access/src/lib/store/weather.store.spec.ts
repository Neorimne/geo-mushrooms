import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { WeatherStore, rangeWindow } from './weather.store';
import { WeatherApiService } from '../services/weather-api.service';
import { ToastStore } from '@geo/shared/ui-toast';
import {
  CitySummary,
  IngestionRun,
  Observation,
} from '../models/observation.model';

type ApiMock = Record<
  | 'getSummaries'
  | 'getObservations'
  | 'getLastUpdate'
  | 'getConfig'
  | 'getAreas'
  | 'deleteLatestCity'
  | 'deleteLatestRegion'
  | 'upsertNote'
  | 'deleteNote'
  | 'getLatestRun'
  | 'scrapeNow'
  | 'scrapeCity'
  | 'scrapeRegion'
  | 'backfillSeason'
  | 'createCity',
  jest.Mock
>;

const runningRun: IngestionRun = {
  id: 1,
  trigger: 'MANUAL_ALL',
  status: 'RUNNING',
  scopeLabel: 'All cities',
  totalCities: 3,
  processed: 0,
  failed: 0,
  currentCity: 'City A',
  errorMessage: null,
  startedAt: '2026-08-05T08:00:00.000Z',
  finishedAt: null,
};

function observation(
  id: number,
  cityId: number,
  date: string,
  overrides: Partial<Observation> = {},
): Observation {
  return {
    id,
    cityId,
    date,
    tMin: 10,
    tMax: 20,
    tPerceived: null,
    precipAmount: 0,
    precipUnit: 'mm',
    precipProb: 10,
    precipType: null,
    windDirection: 'NE',
    windSpeed: 5,
    windGust: null,
    humidity: 70,
    pressure: 1015,
    uvIndex: 4,
    zeroThermalM: 3500,
    snowLineM: null,
    conditionText: 'sereno',
    symbolId: 1,
    fetchedAt: '2026-08-20T08:00:00.000Z',
    note: null,
    ...overrides,
  };
}

function summary(
  cityId: number,
  cityName: string,
  areaId: number,
  areaName: string,
  series: Observation[] = [],
): CitySummary {
  return {
    city: { id: cityId, name: cityName, slug: cityName.toLowerCase() },
    area: { id: areaId, name: areaName },
    latest: series.length ? series[series.length - 1] : null,
    series,
  };
}

describe('WeatherStore', () => {
  let store: InstanceType<typeof WeatherStore>;
  let apiService: ApiMock;
  let toastStore: { showSuccess: jest.Mock; showError: jest.Mock; toasts: jest.Mock };

  beforeEach(() => {
    apiService = {
      getSummaries: jest.fn().mockReturnValue(of([])),
      getObservations: jest.fn().mockReturnValue(of([])),
      getLastUpdate: jest.fn().mockReturnValue(of({ lastUpdate: null })),
      getConfig: jest.fn(),
      getAreas: jest.fn().mockReturnValue(of([])),
      deleteLatestCity: jest.fn(),
      deleteLatestRegion: jest.fn(),
      upsertNote: jest.fn(),
      deleteNote: jest.fn(),
      getLatestRun: jest.fn().mockReturnValue(of(null)),
      scrapeNow: jest.fn().mockReturnValue(of(runningRun)),
      scrapeCity: jest.fn().mockReturnValue(of(runningRun)),
      scrapeRegion: jest.fn().mockReturnValue(of(runningRun)),
      backfillSeason: jest.fn().mockReturnValue(of(runningRun)),
      createCity: jest.fn(),
    };

    toastStore = {
      showSuccess: jest.fn(),
      showError: jest.fn(),
      toasts: jest.fn().mockReturnValue([]),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: WeatherApiService, useValue: apiService },
        { provide: ToastStore, useValue: toastStore },
      ],
    });

    store = TestBed.inject(WeatherStore);
  });

  describe('grouping', () => {
    it('groups cities under their area, both sorted by name', () => {
      apiService.getSummaries.mockReturnValue(
        of([
          summary(3, 'City C', 2, 'Area 2'),
          summary(2, 'City B', 1, 'Area 1'),
          summary(1, 'City A', 1, 'Area 1'),
        ]),
      );

      store.loadSummaries();

      const grouped = store.groupedByArea();
      expect(grouped.map((g) => g.name)).toEqual(['Area 1', 'Area 2']);
      expect(grouped[0].cities.map((c) => c.city.name)).toEqual([
        'City A',
        'City B',
      ]);
      expect(grouped[1].cities).toHaveLength(1);
    });

    it('keeps a city that has no observations yet', () => {
      // The list is the only place to notice — and re-collect — an empty city.
      apiService.getSummaries.mockReturnValue(
        of([summary(1, 'City A', 1, 'Area 1')]),
      );

      store.loadSummaries();

      expect(store.groupedByArea()[0].cities[0].latest).toBeNull();
    });

    it('filters by area', () => {
      apiService.getSummaries.mockReturnValue(
        of([summary(1, 'City A', 1, 'Area 1'), summary(3, 'City C', 2, 'Area 2')]),
      );

      store.loadSummaries();
      store.updateAreaFilter('Area 2');

      const grouped = store.groupedByArea();
      expect(grouped).toHaveLength(1);
      expect(grouped[0].name).toBe('Area 2');
    });

    it('lists every area for the filter dropdown, deduplicated', () => {
      apiService.getSummaries.mockReturnValue(
        of([
          summary(1, 'City A', 1, 'Area 1'),
          summary(2, 'City B', 1, 'Area 1'),
          summary(3, 'City C', 2, 'Area 2'),
        ]),
      );

      store.loadSummaries();

      expect(store.uniqueAreas()).toEqual(['Area 1', 'Area 2']);
    });

    it('asks for the sparkline window and records the last update', () => {
      apiService.getSummaries.mockReturnValue(of([]));
      apiService.getLastUpdate.mockReturnValue(
        of({ lastUpdate: '2026-08-20T08:00:00.000Z' }),
      );

      store.loadSummaries();

      expect(apiService.getSummaries).toHaveBeenCalledWith(14);
      expect(store.lastUpdate()).toBe('2026-08-20T08:00:00.000Z');
      expect(store.isLoading()).toBe(false);
    });
  });

  describe('config and dev tools', () => {
    it('loadConfig sets devToolsEnabled from the API', () => {
      apiService.getConfig.mockReturnValue(of({ devToolsEnabled: true }));

      store.loadConfig();

      expect(store.devToolsEnabled()).toBe(true);
    });

    it('loadConfig falls back to false on error', () => {
      apiService.getConfig.mockReturnValue(throwError(() => new Error('boom')));

      store.loadConfig();

      expect(store.devToolsEnabled()).toBe(false);
    });

    it('deleteLatestCity reloads the list after a successful delete', () => {
      apiService.deleteLatestCity.mockReturnValue(of({ deletedCount: 1 }));

      store.deleteLatestCity(5);

      expect(apiService.deleteLatestCity).toHaveBeenCalledWith(5);
      expect(apiService.getSummaries).toHaveBeenCalled();
    });

    it('deleteLatestRegion reloads the list too', () => {
      apiService.deleteLatestRegion.mockReturnValue(of({ deletedCount: 3 }));

      store.deleteLatestRegion(2);

      expect(apiService.deleteLatestRegion).toHaveBeenCalledWith(2);
      expect(apiService.getSummaries).toHaveBeenCalled();
    });
  });

  describe('notes', () => {
    const loadOneCity = () => {
      const day = observation(11, 1, '2026-08-19');
      apiService.getSummaries.mockReturnValue(
        of([summary(1, 'City A', 1, 'Area 1', [day])]),
      );
      store.loadSummaries();
    };

    it('patches the note in place without a full reload', () => {
      loadOneCity();
      apiService.getSummaries.mockClear();
      const note = {
        id: 7,
        observationId: 11,
        text: 'Found porcini',
        createdAt: 'x',
        updatedAt: 'x',
      };
      apiService.upsertNote.mockReturnValue(of(note));

      store.saveNote({ observationId: 11, text: 'Found porcini' });

      expect(apiService.upsertNote).toHaveBeenCalledWith(11, 'Found porcini');
      expect(store.summaries()[0].series[0].note).toEqual(note);
      expect(store.summaries()[0].latest?.note).toEqual(note);
      expect(apiService.getSummaries).not.toHaveBeenCalled();
    });

    it('patches the same day in the open detail view as well', () => {
      // One observation, two places on screen — a stale copy would show the
      // note vanishing when the user navigates.
      loadOneCity();
      apiService.getObservations.mockReturnValue(
        of([observation(11, 1, '2026-08-19')]),
      );
      store.openCityDetail(1);

      const note = {
        id: 7,
        observationId: 11,
        text: 'Porcini by the lake',
        createdAt: 'x',
        updatedAt: 'x',
      };
      apiService.upsertNote.mockReturnValue(of(note));

      store.saveNote({ observationId: 11, text: 'Porcini by the lake' });

      expect(store.detail()?.series[0].note).toEqual(note);
    });

    it('clears the note on delete', () => {
      loadOneCity();
      const note = {
        id: 7,
        observationId: 11,
        text: 'temp',
        createdAt: 'x',
        updatedAt: 'x',
      };
      apiService.upsertNote.mockReturnValue(of(note));
      store.saveNote({ observationId: 11, text: 'temp' });

      apiService.deleteNote.mockReturnValue(of({ deletedCount: 1 }));
      store.deleteNote(11);

      expect(apiService.deleteNote).toHaveBeenCalledWith(11);
      expect(store.summaries()[0].series[0].note).toBeNull();
    });
  });

  describe('city detail', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-08-20T09:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('opens on a 30-day window', () => {
      apiService.getObservations.mockReturnValue(
        of([observation(1, 4, '2026-08-19')]),
      );

      store.openCityDetail(4);

      expect(apiService.getObservations).toHaveBeenCalledWith(
        4,
        '2026-07-21',
        '2026-08-20',
      );
      expect(store.detail()?.cityId).toBe(4);
      expect(store.detail()?.range).toBe('30d');
      expect(store.detail()?.series).toHaveLength(1);
      expect(store.detail()?.isLoading).toBe(false);
    });

    it('switches window on a range change, keeping the same city', () => {
      store.openCityDetail(4);
      apiService.getObservations.mockClear();

      store.setDetailRange('14d');

      expect(apiService.getObservations).toHaveBeenCalledWith(
        4,
        '2026-08-06',
        '2026-08-20',
      );
      expect(store.detail()?.range).toBe('14d');
    });

    it('reaches back to April for the season range', () => {
      store.openCityDetail(4);
      apiService.getObservations.mockClear();

      store.setDetailRange('season');

      expect(apiService.getObservations).toHaveBeenCalledWith(
        4,
        '2026-04-01',
        '2026-08-20',
      );
    });

    it('ignores a range change when no city is open', () => {
      store.setDetailRange('season');

      expect(apiService.getObservations).not.toHaveBeenCalled();
      expect(store.detail()).toBeNull();
    });

    it('drops a response whose window is no longer the one on screen', () => {
      // Without this a slow 30d response would repaint the chart the user has
      // already switched away from.
      const slow = observation(1, 4, '2026-07-25');
      const fast = observation(2, 4, '2026-08-19');
      apiService.getObservations.mockImplementation((_c: number, from: string) =>
        of(from === '2026-07-21' ? [slow] : [fast]),
      );

      store.openCityDetail(4);
      store.setDetailRange('14d');

      expect(store.detail()?.range).toBe('14d');
      expect(store.detail()?.series).toEqual([fast]);
    });

    it('closes cleanly', () => {
      store.openCityDetail(4);
      store.closeCityDetail();

      expect(store.detail()).toBeNull();
    });

    it('rangeWindow spans exactly what each preset promises', () => {
      expect(rangeWindow('14d')).toEqual({ from: '2026-08-06', to: '2026-08-20' });
      expect(rangeWindow('30d')).toEqual({ from: '2026-07-21', to: '2026-08-20' });
      expect(rangeWindow('season')).toEqual({ from: '2026-04-01', to: '2026-08-20' });
    });

    it('falls back to 30 days when asked for a season that has not started', () => {
      jest.setSystemTime(new Date('2026-02-10T09:00:00.000Z'));

      expect(rangeWindow('season')).toEqual({
        from: '2026-01-11',
        to: '2026-02-10',
      });
    });
  });

  describe('collection runs', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('adopts the run returned by a trigger without waiting for a poll', () => {
      store.scrapeNow();

      expect(store.activeRun()).toEqual(runningRun);
      expect(store.runProgressPercent()).toBe(0);
    });

    it('starts a season backfill the same way as any other run', () => {
      store.backfillSeason();

      expect(apiService.backfillSeason).toHaveBeenCalled();
      expect(store.activeRun()).toEqual(runningRun);
    });

    it('tracks progress reported by the poll', async () => {
      store.scrapeCity(3);
      apiService.getLatestRun.mockReturnValue(
        of({ ...runningRun, processed: 2, currentCity: 'City C' }),
      );

      await jest.advanceTimersByTimeAsync(3000);

      expect(store.activeRun()?.currentCity).toBe('City C');
      expect(store.runProgressPercent()).toBe(67);
    });

    it('shows the city-month a backfill is working on', async () => {
      store.backfillSeason();
      apiService.getLatestRun.mockReturnValue(
        of({
          ...runningRun,
          trigger: 'MANUAL_BACKFILL',
          totalCities: 10,
          processed: 4,
          currentCity: 'Pietralta — 2026-05',
        }),
      );

      await jest.advanceTimersByTimeAsync(3000);

      expect(store.activeRun()?.currentCity).toBe('Pietralta — 2026-05');
      expect(store.runProgressPercent()).toBe(40);
    });

    it('reports the result and reloads the list when the run completes', async () => {
      store.scrapeNow();
      apiService.getSummaries.mockClear();
      apiService.getLatestRun.mockReturnValue(
        of({
          ...runningRun,
          status: 'COMPLETED',
          processed: 3,
          currentCity: null,
          finishedAt: '2026-08-05T08:05:00.000Z',
        }),
      );

      await jest.advanceTimersByTimeAsync(3000);

      expect(store.activeRun()).toBeNull();
      expect(toastStore.showSuccess).toHaveBeenCalledWith(
        expect.stringContaining('3'),
      );
      expect(apiService.getSummaries).toHaveBeenCalled();
    });

    it('reports a run that ended with failures as an error', async () => {
      store.scrapeNow();
      apiService.getLatestRun.mockReturnValue(
        of({ ...runningRun, status: 'COMPLETED', processed: 2, failed: 1, currentCity: null }),
      );

      await jest.advanceTimersByTimeAsync(3000);

      expect(toastStore.showError).toHaveBeenCalled();
      expect(toastStore.showSuccess).not.toHaveBeenCalled();
    });

    it('surfaces the reason a run was aborted', async () => {
      // A rate limit or a rotated key ends the run with a message meant to be read.
      store.scrapeNow();
      apiService.getLatestRun.mockReturnValue(
        of({
          ...runningRun,
          status: 'FAILED',
          currentCity: null,
          errorMessage: 'The source rate-limited the run.',
        }),
      );

      await jest.advanceTimersByTimeAsync(3000);

      expect(toastStore.showError).toHaveBeenCalledWith(
        expect.stringContaining('rate-limited'),
      );
    });

    it('stays quiet about a run that had already finished before the page loaded', async () => {
      apiService.getLatestRun.mockReturnValue(
        of({ ...runningRun, status: 'COMPLETED', processed: 3, currentCity: null }),
      );

      store.pollActiveRun();
      await jest.advanceTimersByTimeAsync(0);

      expect(store.activeRun()).toBeNull();
      expect(toastStore.showSuccess).not.toHaveBeenCalled();
      expect(toastStore.showError).not.toHaveBeenCalled();
    });

    it('stops polling once the run is over', async () => {
      store.scrapeNow();
      apiService.getLatestRun.mockReturnValue(
        of({ ...runningRun, status: 'COMPLETED', processed: 3, currentCity: null }),
      );

      await jest.advanceTimersByTimeAsync(3000);
      const callsAtCompletion = apiService.getLatestRun.mock.calls.length;

      await jest.advanceTimersByTimeAsync(30000);

      expect(apiService.getLatestRun.mock.calls.length).toBe(callsAtCompletion);
    });
  });
});
