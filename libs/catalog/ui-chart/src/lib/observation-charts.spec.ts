import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observation } from '@geo/catalog/util-model';
import { ObservationChartsComponent } from './observation-charts';
import { AXIS_GUTTER_PX } from './chart-geometry';

function day(date: string, overrides: Partial<Observation> = {}): Observation {
  return {
    id: 1,
    cityId: 1,
    date,
    tMin: 11,
    tMax: 22,
    tPerceived: null,
    precipAmount: 8,
    precipUnit: 'mm',
    precipProb: 10,
    precipType: 'p',
    windDirection: 'SSW',
    windSpeed: 6,
    windGust: null,
    humidity: 88,
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

const SERIES = [
  day('2026-08-14'),
  day('2026-08-15', { tMax: 25 }),
  day('2026-08-16', { tMax: 19 }),
];

describe('ObservationChartsComponent', () => {
  let fixture: ComponentFixture<ObservationChartsComponent>;
  let component: ObservationChartsComponent;

  const text = () => fixture.nativeElement.textContent as string;
  const overlay = () =>
    fixture.nativeElement.querySelector('.touch-pan-y') as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ObservationChartsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ObservationChartsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('series', SERIES);
    fixture.detectChanges();
  });

  /**
   * jsdom has no `PointerEvent` and gives every element a zero-sized rect, so
   * a pointer move has to be faked twice over: a `MouseEvent` carries the same
   * `clientX` under the same event name, and the box it is measured against is
   * stubbed to the panel's real viewBox width.
   */
  function pointAt(clientX: number) {
    const target = overlay();
    target.getBoundingClientRect = () =>
      ({ left: 0, width: 640, top: 0, height: 400 }) as DOMRect;
    target.dispatchEvent(
      new MouseEvent('pointermove', { clientX, bubbles: true }),
    );
    fixture.detectChanges();
  }

  it('starts the pointer layer where the plots start', () => {
    // The crosshair is positioned as a percentage of the *plot*, so a layer
    // spanning the whole card would put it a gutter's width off the day it
    // names. Both sides read AXIS_GUTTER_PX; this is what says so.
    expect(overlay().parentElement?.style.left).toBe(`${AXIS_GUTTER_PX}px`);
  });

  it('stacks all three panels', () => {
    expect(fixture.nativeElement.querySelector('lib-daily-chart')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('lib-wind-chart')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('lib-humidity-chart')).not.toBeNull();
  });

  it('shows nothing until the pointer is on the chart', () => {
    expect(component.readout()).toBeNull();
  });

  it('names the day under the pointer', () => {
    pointAt(40); // the left edge, past the 32-unit axis gutter

    expect(component.readout()?.date).toBe('14 Aug');
    expect(text()).toContain('14 Aug');
  });

  it('follows the pointer to another day', () => {
    pointAt(640);

    expect(component.readout()?.date).toBe('16 Aug');
  });

  it('reports every metric for that one day, wind converted to km/h', () => {
    pointAt(40);
    const readout = component.readout();

    expect(readout?.tMax).toBe('22');
    expect(readout?.tMin).toBe('11');
    expect(readout?.precip).toBe('8 mm');
    // 6 kn is 11 km/h — the stored column is knots.
    expect(readout?.wind).toBe('11 km/h');
    expect(readout?.humidity).toBe('88%');
    expect(readout?.windDirection).toBe('SSW');
    // The readout sits under a pointer-events-none tooltip, so its arrow's
    // <title> was unreachable even with a mouse. The direction is printed now.
    expect(text()).toContain('SSW');
  });

  it('flips the readout to the other side near the right edge', () => {
    pointAt(40);
    expect(component.readout()?.flipped).toBe(false);

    pointAt(640);
    expect(component.readout()?.flipped).toBe(true);
  });

  it('clears when the pointer leaves', () => {
    pointAt(40);
    expect(component.readout()).not.toBeNull();

    overlay().dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    fixture.detectChanges();

    expect(component.readout()).toBeNull();
  });

  it('has nothing to report for an empty series', () => {
    fixture.componentRef.setInput('series', []);
    fixture.detectChanges();

    pointAt(100);

    expect(component.readout()).toBeNull();
  });
});
