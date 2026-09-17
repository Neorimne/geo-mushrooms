import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_URL, WeatherApiService } from '@geo/catalog/data-access';
import { CitySummary, Observation } from '@geo/catalog/util-model';
import { CityDetailComponent } from './city-detail';

function observation(id: number, date: string, overrides: Partial<Observation> = {}): Observation {
  return {
    id,
    cityId: 4,
    date,
    tMin: 11,
    tMax: 22,
    tPerceived: null,
    precipAmount: 0,
    precipUnit: 'mm',
    precipProb: 10,
    precipType: null,
    windDirection: 'NE',
    windSpeed: 5,
    windGust: null,
    humidity: 80,
    pressure: 1014,
    uvIndex: 5,
    zeroThermalM: 3600,
    snowLineM: null,
    conditionText: 'sereno',
    symbolId: 1,
    fetchedAt: '2026-08-20T08:00:00.000Z',
    note: null,
    ...overrides,
  };
}

const SUMMARY: CitySummary = {
  city: { id: 4, name: 'Rocchetta', slug: 'rocchetta' },
  area: { id: 2, name: 'Val Rovina' },
  latest: null,
  series: [],
};

describe('CityDetailComponent', () => {
  let fixture: ComponentFixture<CityDetailComponent>;
  let component: CityDetailComponent;
  let apiService: {
    getSummaries: jest.Mock;
    getObservations: jest.Mock;
    getLastUpdate: jest.Mock;
    upsertNote: jest.Mock;
    deleteNote: jest.Mock;
  };

  const text = () => fixture.nativeElement.textContent as string;

  beforeEach(async () => {
    apiService = {
      getSummaries: jest.fn().mockReturnValue(of([SUMMARY])),
      getObservations: jest
        .fn()
        .mockReturnValue(of([observation(1, '2026-08-18'), observation(2, '2026-08-19')])),
      getLastUpdate: jest.fn().mockReturnValue(of({ lastUpdate: null })),
      upsertNote: jest.fn().mockReturnValue(of({})),
      deleteNote: jest.fn().mockReturnValue(of({ deletedCount: 1 })),
    };

    await TestBed.configureTestingModule({
      imports: [CityDetailComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_URL, useValue: 'http://localhost:3000' },
        { provide: WeatherApiService, useValue: apiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CityDetailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 4);
  });

  it('opens the city on a 30-day window', () => {
    fixture.detectChanges();

    expect(apiService.getObservations).toHaveBeenCalledTimes(1);
    expect(apiService.getObservations.mock.calls[0][0]).toBe(4);
    expect(component.store.detail()?.range).toBe('30d');
  });

  it('names the city from the list data', () => {
    fixture.detectChanges();

    expect(text()).toContain('Rocchetta');
    expect(text()).toContain('Val Rovina');
  });

  it('renders the chart', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('lib-daily-chart')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('svg')).not.toBeNull();
  });

  it('lists the days newest first, so the log reads top-down', () => {
    fixture.detectChanges();

    expect(component.days().map((d) => d.date)).toEqual([
      '2026-08-19',
      '2026-08-18',
    ]);
  });

  it('switches the window when a range chip is picked', () => {
    fixture.detectChanges();
    apiService.getObservations.mockClear();

    component.selectRange('14d');
    fixture.detectChanges();

    expect(apiService.getObservations).toHaveBeenCalled();
    expect(component.store.detail()?.range).toBe('14d');
  });

  it('saves a note against the observation id, not the city', () => {
    fixture.detectChanges();

    component.saveNote(2, 'Porcini by the lake');

    expect(apiService.upsertNote).toHaveBeenCalledWith(2, 'Porcini by the lake');
  });

  it('deletes a note by observation id', () => {
    fixture.detectChanges();

    component.deleteNote(2);

    expect(apiService.deleteNote).toHaveBeenCalledWith(2);
  });

  it('does not fetch the list again when it is already loaded', () => {
    component.store.loadSummaries();
    apiService.getSummaries.mockClear();

    fixture.detectChanges();

    expect(apiService.getSummaries).not.toHaveBeenCalled();
  });

  it('prints a zero reading as zero and a gap as a dash', () => {
    expect(component.format(0)).toBe('0');
    expect(component.format(null)).toBe('—');
  });

  it('labels precipitation with the unit the day carries', () => {
    expect(component.precipUnit(observation(1, '2026-01-07', { precipUnit: 'cm' }))).toBe('cm');
    expect(component.precipUnit(observation(1, '2026-08-19', { precipUnit: null }))).toBe('mm');
  });

  it('shows an empty state for a window with no days', () => {
    apiService.getObservations.mockReturnValue(of([]));

    fixture.detectChanges();

    expect(text()).toContain('No data for the selected range');
  });
});
