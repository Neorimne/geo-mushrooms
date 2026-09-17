import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { API_URL, WeatherApiService } from '@geo/catalog/data-access';
import {
  CitySummary,
  IngestionRun,
  Observation,
  newestArchiveDayIso,
} from '@geo/catalog/util-model';
import { WeatherListComponent } from './weather-list';

const runningRun: IngestionRun = {
  id: 1,
  trigger: 'MANUAL_REGION',
  status: 'RUNNING',
  scopeLabel: 'Val Serena',
  totalCities: 4,
  processed: 1,
  failed: 0,
  currentCity: 'Alpha',
  errorMessage: null,
  startedAt: new Date().toISOString(),
  finishedAt: null,
};

function observation(date: string): Observation {
  return {
    id: 1,
    cityId: 1,
    date,
    tMin: 12,
    tMax: 24,
    tPerceived: null,
    precipAmount: 1.2,
    precipUnit: 'mm',
    precipProb: 30,
    precipType: 'p',
    windDirection: 'NE',
    windSpeed: 5,
    windGust: null,
    humidity: 85,
    pressure: 1015,
    uvIndex: 5,
    zeroThermalM: 3400,
    snowLineM: null,
    conditionText: 'sereno',
    symbolId: 1,
    fetchedAt: '2026-08-20T08:00:00.000Z',
    note: null,
  };
}

const SUMMARY: CitySummary = {
  city: { id: 7, name: 'Pietralta', slug: 'pietralta' },
  area: { id: 1, name: 'Verdolo' },
  latest: observation(newestArchiveDayIso()),
  series: [observation(newestArchiveDayIso())],
};

describe('WeatherListComponent', () => {
  let component: WeatherListComponent;
  let fixture: ComponentFixture<WeatherListComponent>;
  let apiService: {
    getSummaries: jest.Mock;
    getObservations: jest.Mock;
    getLastUpdate: jest.Mock;
    getConfig: jest.Mock;
    getAreas: jest.Mock;
    getLatestRun: jest.Mock;
    scrapeRegion: jest.Mock;
    backfillSeason: jest.Mock;
    createCity: jest.Mock;
  };

  const progressStrip = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('[data-testid="run-progress"]');

  beforeEach(async () => {
    // Polling schedules an interval on init; fake timers keep it inert unless advanced.
    jest.useFakeTimers();

    apiService = {
      getSummaries: jest.fn().mockReturnValue(of([])),
      getObservations: jest.fn().mockReturnValue(of([])),
      getLastUpdate: jest.fn().mockReturnValue(of({ lastUpdate: null })),
      getConfig: jest.fn().mockReturnValue(of({ devToolsEnabled: false })),
      getAreas: jest.fn().mockReturnValue(of([])),
      getLatestRun: jest.fn().mockReturnValue(of(null)),
      scrapeRegion: jest.fn().mockReturnValue(of(runningRun)),
      backfillSeason: jest.fn().mockReturnValue(of(runningRun)),
      createCity: jest.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [WeatherListComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_URL, useValue: 'http://localhost:3000' },
        { provide: WeatherApiService, useValue: apiService },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(WeatherListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders one card per city', () => {
    apiService.getSummaries.mockReturnValue(of([SUMMARY]));
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('lib-city-summary-card');
    expect(cards).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Pietralta');
    expect(fixture.nativeElement.textContent).toContain('Verdolo');
  });

  it('navigates to the city page when a card is opened', () => {
    const router = TestBed.inject(Router);
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true);

    component.openCity(7);

    expect(navigate).toHaveBeenCalledWith(['city', 7]);
  });

  it('hides the progress strip when nothing is being collected', () => {
    fixture.detectChanges();

    expect(progressStrip()).toBeNull();
  });

  it('shows scope, counters and current unit once a run starts', () => {
    fixture.detectChanges();

    component.store.scrapeRegion(7);
    fixture.detectChanges();

    const strip = progressStrip();
    expect(strip).not.toBeNull();
    expect(strip?.textContent).toContain('Val Serena');
    expect(strip?.textContent).toContain('1 / 4');
    expect(strip?.textContent).toContain('Alpha');
  });

  it('shows a backfill\'s city-month as the current unit', () => {
    // A backfill counts city-months, not cities — the same strip has to read
    // sensibly for both.
    apiService.backfillSeason.mockReturnValue(
      of({
        ...runningRun,
        trigger: 'MANUAL_BACKFILL',
        scopeLabel: 'Season 2026 (Apr–Aug)',
        totalCities: 20,
        processed: 6,
        currentCity: 'Pietralta — 2026-06',
      }),
    );
    fixture.detectChanges();

    component.store.backfillSeason();
    fixture.detectChanges();

    const strip = progressStrip();
    expect(strip?.textContent).toContain('Season 2026');
    expect(strip?.textContent).toContain('6 / 20');
    expect(strip?.textContent).toContain('Pietralta — 2026-06');
  });

  it('counts failures towards progress', () => {
    apiService.scrapeRegion.mockReturnValue(
      of({ ...runningRun, processed: 1, failed: 1 }),
    );
    fixture.detectChanges();

    component.store.scrapeRegion(7);
    fixture.detectChanges();

    expect(progressStrip()?.textContent).toContain('2 / 4');
    expect(component.store.runProgressPercent()).toBe(50);
    expect(progressStrip()?.textContent).toContain('failed: 1');
  });

  it('stops showing progress once the run leaves RUNNING', async () => {
    fixture.detectChanges();
    component.store.scrapeRegion(7);
    fixture.detectChanges();
    expect(progressStrip()).not.toBeNull();

    apiService.getLatestRun.mockReturnValue(
      of({ ...runningRun, status: 'COMPLETED', processed: 4, finishedAt: new Date().toISOString() }),
    );
    await jest.advanceTimersByTimeAsync(3000);
    fixture.detectChanges();

    expect(progressStrip()).toBeNull();
    expect(component.store.activeRun()).toBeNull();
  });

  it('has one filter select now that days are no longer picked by hand', () => {
    // The old date filter listed free-form Italian date strings; observations
    // are keyed by a real date and browsed on the city page instead.
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('select')).toHaveLength(1);
  });
});
