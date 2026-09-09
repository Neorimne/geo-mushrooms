import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartFrameComponent } from './chart-frame';
import { AXIS_GUTTER_PX } from './chart-geometry';

describe('ChartFrameComponent', () => {
  let fixture: ComponentFixture<ChartFrameComponent>;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartFrameComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartFrameComponent);
  });

  function render(
    ticks: { label: string; topPercent: number }[] = [],
    dateLabels: { text: string; leftPercent: number }[] = [],
  ) {
    fixture.componentRef.setInput('ticks', ticks);
    fixture.componentRef.setInput('dateLabels', dateLabels);
    fixture.detectChanges();
  }

  it('prints every axis value at the height it belongs to', () => {
    render([
      { label: '12', topPercent: 96.9 },
      { label: '35', topPercent: 4.6 },
    ]);

    const values = Array.from(el().querySelectorAll('span'));
    expect(values.map((v) => v.textContent?.trim())).toEqual(['12', '35']);
    expect(values[0].style.top).toBe('96.9%');
    expect(values[1].style.top).toBe('4.6%');
  });

  it('reserves the gutter in pixels, not in viewBox units', () => {
    // The whole point of the frame: a gutter measured in viewBox units is
    // stretched with everything else, so it is 16px on a phone and 115px on a
    // desktop. Pixels hold the same text at every width.
    render([{ label: '-10.5', topPercent: 50 }]);

    const rows = Array.from(el().querySelectorAll<HTMLElement>('div'));
    expect(rows[0].style.paddingLeft).toBe(`${AXIS_GUTTER_PX}px`);
  });

  it('pulls the end dates inside the plot instead of centring them', () => {
    render(
      [],
      [
        { text: '8 Aug', leftPercent: 1.25 },
        { text: '18 Aug', leftPercent: 50 },
        { text: '4 Sep', leftPercent: 98.75 },
      ],
    );

    const dates = Array.from(el().querySelectorAll<HTMLElement>('span'));
    // A centred first label hangs into the gutter and a centred last one off
    // the card, which is exactly what the SVG version used to do.
    expect(dates[0].style.transform).toBe('translateX(0)');
    expect(dates[1].style.transform).toBe('translateX(-50%)');
    expect(dates[2].style.transform).toBe('translateX(-100%)');
  });

  it('omits the date row entirely when there are no dates', () => {
    render([{ label: '50', topPercent: 50 }]);

    expect(el().querySelectorAll('span')).toHaveLength(1);
  });
});
