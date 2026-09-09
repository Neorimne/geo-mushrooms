import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Observation, precipInMm } from '@geo/catalog/data-access';
import {
  SPARKLINE_BOX,
  extentOf,
  padExtent,
  toBars,
  toLinePath,
} from './chart-geometry';

/**
 * The trailing-fortnight glance on a city card: rain as bars, the daily high as
 * a line over them.
 *
 * Deliberately unlabelled — at 56×24 there is room for a shape, not for
 * numbers. The card prints the latest day's figures next to it.
 */
@Component({
  selector: 'lib-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (hasData()) {
      <svg
        [attr.viewBox]="viewBox"
        class="w-14 h-6 overflow-visible"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="label()"
      >
        @for (bar of bars(); track $index) {
          <rect
            [attr.x]="bar.x"
            [attr.y]="bar.y"
            [attr.width]="bar.width"
            [attr.height]="bar.height"
            class="fill-sky-300 dark:fill-sky-600"
          />
        }
        <path
          [attr.d]="tMaxPath()"
          fill="none"
          stroke-width="1.25"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="stroke-orange-500 dark:stroke-orange-400"
        />
      </svg>
    } @else {
      <span class="text-[10px] text-slate-300 dark:text-slate-600">—</span>
    }
  `,
})
export class SparklineComponent {
  series = input.required<Observation[]>();

  readonly viewBox = `0 0 ${SPARKLINE_BOX.width} ${SPARKLINE_BOX.height}`;

  private readonly tMax = computed(() => this.series().map((o) => o.tMax));
  /** Converted to millimetres so a snow day is not drawn ten times too short. */
  private readonly precip = computed(() =>
    this.series().map((o) => precipInMm(o.precipAmount, o.precipUnit)),
  );

  readonly hasData = computed(() => extentOf(this.tMax()) !== null);

  readonly bars = computed(() => toBars(this.precip(), SPARKLINE_BOX, 0.55));

  readonly tMaxPath = computed(() => {
    const extent = extentOf(this.tMax());
    if (!extent) return '';
    return toLinePath(this.tMax(), padExtent(extent, 0.15), SPARKLINE_BOX);
  });

  readonly label = computed(() => {
    const days = this.series().length;
    return `Last ${days} days: high temperature and precipitation`;
  });
}
