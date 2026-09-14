import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CitySummary, Observation, newestArchiveDayIso } from '@geo/catalog/data-access';
import { CitySummaryCardComponent } from './city-summary-card';

function observation(date: string, overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    cityId: 1,
    date,
    tMin: 12,
    tMax: 24,
    tPerceived: null,
    precipAmount: 3.4,
    precipUnit: 'mm',
    precipProb: 60,
    precipType: 'p',
    windDirection: 'SSW',
    windSpeed: 6,
    windGust: null,
    humidity: 88,
    pressure: 1015,
    uvIndex: 5,
    zeroThermalM: 3400,
    snowLineM: null,
    conditionText: 'rovesci',
    symbolId: 1,
    fetchedAt: '2026-08-20T08:00:00.000Z',
    note: null,
    ...overrides,
  };
}

function summary(series: Observation[]): CitySummary {
  return {
    city: { id: 1, name: 'Pietralta', slug: 'pietralta' },
    area: { id: 1, name: 'Verdolo' },
    latest: series.length ? series[series.length - 1] : null,
    series,
  };
}

describe('CitySummaryCardComponent', () => {
  let fixture: ComponentFixture<CitySummaryCardComponent>;
  let component: CitySummaryCardComponent;

  const text = () => fixture.nativeElement.textContent as string;

  const render = (value: CitySummary) => {
    fixture.componentRef.setInput('summary', value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CitySummaryCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CitySummaryCardComponent);
    component = fixture.componentInstance;
  });

  it('shows the latest day\'s figures', () => {
    render(summary([observation('2026-08-19')]));

    expect(text()).toContain('24');
    expect(text()).toContain('12');
    expect(text()).toContain('3.4');
    expect(text()).toContain('88');
  });

  it('prints the wind in km/h, not the knots the source stores', () => {
    render(summary([observation('2026-08-19')]));

    // 6 kn is 11 km/h. Printing the stored 6 under a "km/h" label understated
    // every windy day by 45%.
    expect(text()).toContain('11 km/h');
  });

  it('prints the direction in words, not only as an arrow', () => {
    render(summary([observation('2026-08-19')]));

    // The word is the point: a <title> is a hover tooltip and this card is read
    // on a phone, where the angle of a 12px glyph was the only thing left.
    expect(text()).toContain('SSW');

    // SSW is a bearing of 202.5°; the arrow points where the wind is going.
    const arrow = fixture.nativeElement.querySelector(
      'lib-wind-arrow svg',
    ) as SVGElement;
    expect(arrow.style.transform).toBe('rotate(22.5deg)');
  });

  it('counts the archive edge as fresh, not the calendar', () => {
    // Expecting today marks every city stale for ever — and so does expecting
    // yesterday, since the source holds its last two days back for validation.
    render(summary([observation(newestArchiveDayIso())]));

    expect(component.fresh()).toBe(true);
    expect(text()).toContain('up to date');
  });

  it('marks an older latest day as not updated', () => {
    render(summary([observation('2026-01-01')]));

    expect(component.fresh()).toBe(false);
    expect(text()).toContain('not updated');
  });

  it('handles a city with nothing collected yet', () => {
    render(summary([]));

    expect(component.latest()).toBeNull();
    expect(component.fresh()).toBe(false);
    expect(text()).toContain('no data');
    expect(text()).toContain('Nothing collected yet');
  });

  it('tells a city that has fallen behind from one that never collected', () => {
    // The backend keeps `latest` even when it predates the sparkline window;
    // the card must then show the day and say "stale", not "nothing here".
    render({
      ...summary([]),
      latest: observation('2026-07-02'),
    });

    expect(text()).toContain('2026-07-02');
    expect(text()).toContain('not updated');
    expect(text()).not.toContain('Nothing collected yet');
  });

  it('prints a zero reading as zero, not as a gap', () => {
    // A dry day and a missing measurement are different facts.
    expect(component.format(0)).toBe('0');
    expect(component.format(null)).toBe('—');
  });

  it('labels precipitation with the unit the source actually sent', () => {
    // A snow day arrives in centimetres; the card says so rather than
    // relabelling it mm.
    render(summary([observation('2026-01-07', { precipUnit: 'cm', precipType: 'n' })]));

    expect(component.precipUnit()).toBe('cm');
    expect(text()).toContain('cm');
  });

  it('falls back to mm when the day carries no unit', () => {
    render(summary([observation('2026-08-19', { precipUnit: null })]));

    expect(component.precipUnit()).toBe('mm');
  });

  it('flags a window that contains a note', () => {
    const withNote = observation('2026-08-18', {
      note: {
        id: 3,
        observationId: 1,
        text: 'Porcini',
        createdAt: 'x',
        updatedAt: 'x',
      },
    });
    render(summary([withNote, observation('2026-08-19')]));

    expect(component.hasNote()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[aria-label="Has a note"]'),
    ).not.toBeNull();
  });

  it('emits when the card is opened', () => {
    const opened = jest.fn();
    component.opened.subscribe(opened);
    render(summary([observation('2026-08-19')]));

    fixture.nativeElement.querySelector('button').click();

    expect(opened).toHaveBeenCalled();
  });
});
