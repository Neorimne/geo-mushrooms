import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { windArrowRotation, windDirectionLabel } from '@geo/catalog/data-access';

/**
 * The wind direction glyph, and optionally the direction in words.
 *
 * **One component because there were four copies.** The same path was pasted
 * into the wind panel, the crosshair readout, the summary card and the day log,
 * and two of them rotated it with the SVG `transform` attribute (about the
 * user-space origin) while two used a CSS transform (about the element's
 * centre). Both looked right only because the `-6 -6 12 12` viewBox happens to
 * put the origin at the centre — change that in one file and the two mechanisms
 * quietly stop agreeing. This rotates with CSS, which does not depend on the
 * viewBox at all.
 *
 * **`showLabel` exists because an arrow alone is not readable.** A `<title>` is
 * a hover tooltip, and this app is used on a phone where nothing hovers, so for
 * the primary user the direction was inferable only from the angle of a 12px
 * glyph — and two of the four sites were unreachable even with a mouse, sitting
 * under the crosshair overlay or inside a `pointer-events-none` tooltip. Where
 * there is room for the word, print the word. The wind panel is the one place
 * that passes it up: ten labels across its band would collide into a smear, and
 * the readout above it answers in words for whichever day is being read.
 */
@Component({
  selector: 'lib-wind-arrow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1' },
  template: `
    @if (rotation() !== null) {
      <svg
        class="w-3 h-3 shrink-0"
        viewBox="-6 -6 12 12"
        role="img"
        [style.transform]="'rotate(' + rotation() + 'deg)'"
      >
        <title>{{ tooltip() }}</title>
        <path d="M 0 -4.5 L 3 4 L 0 2 L -3 4 Z" fill="currentColor" />
      </svg>
      @if (showLabel() && label(); as text) {
        <span class="shrink-0">{{ text }}</span>
      }
    }
  `,
})
export class WindArrowComponent {
  /** The 16-point compass code, e.g. `'SSW'`. */
  direction = input.required<string | null>();

  /** Whether to print the direction in words beside the glyph. */
  showLabel = input(false);

  /** Prepended to the tooltip, for callers that know more (a date, a speed). */
  context = input<string | null>(null);

  /**
   * Half a turn from the bearing: meteorological names say where the wind comes
   * **from**, and the arrow shows where it is going. Null — and so no glyph at
   * all — when the source sent nothing recognisable.
   */
  readonly rotation = computed(() => windArrowRotation(this.direction()));

  /** The direction in words. Announced by screen readers even when not printed. */
  readonly label = computed(() => windDirectionLabel(this.direction()));

  readonly tooltip = computed(() => {
    const label = this.label();
    const context = this.context();
    // Lower case, then capitalised only when it starts the string — the
    // compass abbreviation must keep its own case either way ('SSW', not 'ssw').
    const wind = label ? `wind ${label}` : 'wind direction';
    return context
      ? `${context}, ${wind}`
      : wind.charAt(0).toUpperCase() + wind.slice(1);
  });
}
