import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observation } from '@geo/catalog/data-access';
import { HumidityChartComponent } from './humidity-chart';

function day(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    cityId: 1,
    date: '2026-08-19',
    tMin: 11,
    tMax: 22,
    tPerceived: null,
    precipAmount: 0,
    precipUnit: 'mm',
    precipProb: 10,
    precipType: null,
    windDirection: 'N',
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

describe('HumidityChartComponent', () => {
  let fixture: ComponentFixture<HumidityChartComponent>;
  let component: HumidityChartComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HumidityChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HumidityChartComponent);
    component = fixture.componentInstance;
  });

  function render(series: Observation[]) {
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();
  }

  it('draws a line through the days it has', () => {
    render([day({ humidity: 60 }), day({ humidity: 90 })]);

    expect(component.hasData()).toBe(true);
    expect(component.humidityPath()).toContain('M ');
    expect(component.humidityPath()).toContain('L ');
  });

  it('keeps the axis at 0–100 whatever the data does', () => {
    // Two cities have to be comparable page to page, so the scale cannot
    // follow the readings.
    render([day({ humidity: 70 }), day({ humidity: 80 })]);
    const narrow = component.humidityPath();

    render([day({ humidity: 0 }), day({ humidity: 100 })]);
    const wide = component.humidityPath();

    expect(narrow).not.toBe(wide);
    expect(component.gridLines.map((line) => line.label)).toEqual([
      '0',
      '25',
      '50',
      '75',
      '100',
    ]);
  });

  it('breaks the line rather than bridging a missing day', () => {
    render([day({ humidity: 60 }), day({ humidity: null }), day({ humidity: 90 })]);

    expect(component.humidityPath().match(/M /g)).toHaveLength(2);
  });

  it('says so when there is no humidity data at all', () => {
    render([day({ humidity: null })]);

    expect(component.hasData()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No humidity data');
  });
});
