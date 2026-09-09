import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observation } from '@geo/catalog/data-access';
import { WindChartComponent } from './wind-chart';

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

describe('WindChartComponent', () => {
  let fixture: ComponentFixture<WindChartComponent>;
  let component: WindChartComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WindChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WindChartComponent);
    component = fixture.componentInstance;
  });

  function render(series: Observation[]) {
    fixture.componentRef.setInput('series', series);
    fixture.detectChanges();
  }

  it('draws a line through the days it has', () => {
    render([day({ windSpeed: 4 }), day({ windSpeed: 9 })]);

    expect(component.hasData()).toBe(true);
    expect(component.speedPath()).toContain('M ');
    expect(component.speedPath()).toContain('L ');
  });

  it('anchors the scale at zero so a calm week stays flat', () => {
    render([day({ windSpeed: 5 }), day({ windSpeed: 6 })]);

    // 5 kn and 6 kn are 9 and 11 km/h: on a fitted scale they would span the
    // whole panel. From zero they sit near the bottom, which is the truth.
    const lines = component.gridLines();
    expect(lines[0].value).toBe(0);
    expect(lines[lines.length - 1].value).toBeGreaterThan(11);
  });

  it('breaks the line rather than bridging a missing day', () => {
    render([day({ windSpeed: 4 }), day({ windSpeed: null }), day({ windSpeed: 9 })]);

    expect(component.speedPath().match(/M /g)).toHaveLength(2);
  });

  it('turns each arrow to where the wind is going', () => {
    render([day({ windDirection: 'N' })]);

    expect(component.arrows()).toHaveLength(1);

    const arrow = fixture.nativeElement.querySelector(
      'lib-wind-arrow svg',
    ) as SVGElement;
    // A northerly blows *towards* the south: half a turn from the bearing.
    expect(arrow.style.transform).toBe('rotate(180deg)');
    expect(arrow.querySelector('title')?.textContent).toContain('N');
  });

  it('names the day and the speed in the arrow tooltip', () => {
    render([day({ windDirection: 'N', windSpeed: 5, date: '2026-08-19' })]);

    const title = fixture.nativeElement.querySelector(
      'lib-wind-arrow title',
    ) as SVGTitleElement;
    // 5 kn is 9 km/h.
    expect(title.textContent).toBe('2026-08-19: 9 km/h, wind N');
  });

  it('leaves the direction out of the band itself', () => {
    render([day({ windDirection: 'SSW' })]);

    // Ten labels across this band would collide; the crosshair readout above
    // answers in words for whichever day is being read. The <title> still
    // carries it, which is why this asks for the printed span rather than the
    // element's text.
    expect(
      fixture.nativeElement.querySelector('lib-wind-arrow span'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('lib-wind-arrow title')?.textContent,
    ).toContain('SSW');
  });

  it('omits the arrow when the direction is missing or unknown', () => {
    render([day({ windDirection: null }), day({ windDirection: 'XYZ' })]);

    expect(component.arrows()).toEqual([]);
  });

  it('thins the arrows so a long range does not smear', () => {
    const series = Array.from({ length: 60 }, (_, i) =>
      day({ date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
    render(series);

    expect(component.arrows().length).toBeLessThanOrEqual(10);
  });

  it('says so when there is no wind data at all', () => {
    render([day({ windSpeed: null })]);

    expect(component.hasData()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No wind data');
  });
});
