import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WindArrowComponent } from './wind-arrow';

describe('WindArrowComponent', () => {
  let fixture: ComponentFixture<WindArrowComponent>;

  const el = () => fixture.nativeElement as HTMLElement;
  const svg = () => el().querySelector('svg');
  const title = () => el().querySelector('title')?.textContent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WindArrowComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WindArrowComponent);
  });

  function render(direction: string | null, options: Record<string, unknown> = {}) {
    fixture.componentRef.setInput('direction', direction);
    for (const [key, value] of Object.entries(options)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
  }

  it('points where the wind is going, not where it came from', () => {
    render('N');

    // Meteorological names say where the wind comes *from*, so the arrow is
    // half a turn from the bearing. Dropping that 180° is the classic bug here.
    expect(svg()?.getAttribute('style')).toContain('rotate(180deg)');
  });

  it('rotates with CSS rather than the SVG transform attribute', () => {
    render('SSW');

    // Four copies of this glyph used to disagree about which mechanism to use.
    // CSS rotates about the element's centre whatever the viewBox says.
    expect(svg()?.querySelector('path')?.getAttribute('transform')).toBeNull();
    expect(svg()?.getAttribute('style')).toContain('rotate(22.5deg)');
  });

  it('keeps the compass abbreviation upper case inside a lower-case phrase', () => {
    render('ssw', { showLabel: true, context: '2026-08-19: 9 km/h' });

    // The phrase around it is lower case, but the compass point is an
    // abbreviation and has to stay upper case — 'wind ssw' reads as a typo.
    expect(el().textContent).toContain('SSW');
    expect(title()).toBe('2026-08-19: 9 km/h, wind SSW');
  });

  it('reads as a sentence when it stands alone', () => {
    render('SSW');

    expect(title()).toBe('Wind SSW');
  });

  it('prints no word unless asked, so the wind band does not smear', () => {
    render('SSW');

    expect(el().querySelector('span')).toBeNull();
    // The screen reader still gets it either way.
    expect(title()).toContain('SSW');
  });

  it('draws nothing at all for a direction it does not recognise', () => {
    render('XYZ');
    expect(svg()).toBeNull();

    render(null);
    expect(svg()).toBeNull();
  });
});
