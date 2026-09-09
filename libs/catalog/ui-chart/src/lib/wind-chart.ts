import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  Observation,
  windArrowRotation,
  windSpeedKmh,
} from '@geo/catalog/data-access';
import {
  Extent,
  SECONDARY_CHART_BOX,
  extentOf,
  gridLinesFor,
  labelIndices,
  toLinePath,
  xPercent,
} from './chart-geometry';
import { ChartFrameComponent } from './chart-frame';
import { WindArrowComponent } from './wind-arrow';

/** How many horizontal gridlines the speed axis gets. */
const GRID_LINES = 3;

/** At 640 units wide, ten arrows sit ~64 apart — dense but never touching. */
const MAX_ARROWS = 10;

/**
 * Daily wind: speed as a line, direction as arrows in the band beneath it.
 *
 * Two decisions worth keeping:
 *
 * - The scale is anchored at **zero** instead of padded around the data. Wind is
 *   a magnitude, not a range like temperature; a floating baseline would draw a
 *   still week as a mountain range.
 * - **Gusts are absent on purpose.** The source's `raffica` is exactly
 *   `intensita × 1.4` on every day we have ever collected — a derived constant,
 *   not a measurement — so a gust line would run parallel to this one and say
 *   nothing.
 *
 * Speed arrives in knots and is converted for display by `windSpeedKmh`; see
 * that function for why the stored column is not already km/h.
 */
@Component({
  selector: 'lib-wind-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartFrameComponent, WindArrowComponent],
  template: `
    @if (hasData()) {
      <lib-chart-frame [ticks]="gridLines()">
        <svg
          [attr.viewBox]="viewBox"
          class="block w-full h-32 sm:h-40"
          preserveAspectRatio="none"
          role="img"
          aria-label="Daily wind speed and direction"
        >
          <!-- Rules only; the km/h values beside them are HTML, laid out by
               lib-chart-frame at a real font size. -->
          @for (line of gridLines(); track $index) {
            <line
              x1="0"
              [attr.y1]="line.y"
              [attr.x2]="box.width"
              [attr.y2]="line.y"
              stroke-width="1"
              class="stroke-slate-200 dark:stroke-slate-700"
            />
          }

          <path
            [attr.d]="speedPath()"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="stroke-teal-600 dark:stroke-teal-400"
          />
        </svg>

        <!-- Direction, as arrows pointing where the wind is going. Percentages
             put them on the same columns the line uses. No words here: ten
             labels across this band would collide, and the crosshair readout
             above names the direction for whichever day is being read. -->
        <div class="relative h-4 text-teal-600/80 dark:text-teal-400/80">
          @for (arrow of arrows(); track arrow.leftPercent) {
            <lib-wind-arrow
              class="absolute top-0 -translate-x-1/2"
              [style.left.%]="arrow.leftPercent"
              [direction]="arrow.direction"
              [context]="arrow.context"
            />
          }
        </div>
      </lib-chart-frame>

      <div class="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span class="w-3 h-0.5 rounded-full bg-teal-600 dark:bg-teal-400"></span>
        Wind, km/h — the arrow shows where it is blowing to
      </div>
    } @else {
      <div class="flex items-center justify-center h-32 text-sm text-slate-400 dark:text-slate-500">
        No wind data for the selected range
      </div>
    }
  `,
})
export class WindChartComponent {
  series = input.required<Observation[]>();

  readonly box = SECONDARY_CHART_BOX;
  readonly viewBox = `0 0 ${SECONDARY_CHART_BOX.width} ${SECONDARY_CHART_BOX.height}`;

  /** Knots in the column, km/h on the axis. */
  private readonly speeds = computed(() =>
    this.series().map((o) => windSpeedKmh(o.windSpeed)),
  );

  /**
   * Zero-anchored, with headroom above the peak. `padExtent` is wrong here:
   * it would pad the floor too and put a negative wind speed on the axis.
   */
  private readonly speedExtent = computed<Extent | null>(() => {
    const extent = extentOf(this.speeds());
    if (!extent) return null;
    return { min: 0, max: extent.max === 0 ? 1 : extent.max * 1.15 };
  });

  readonly hasData = computed(() => this.speedExtent() !== null);

  readonly speedPath = computed(() => {
    const extent = this.speedExtent();
    return extent ? toLinePath(this.speeds(), extent, this.box) : '';
  });

  readonly gridLines = computed(() => {
    const extent = this.speedExtent();
    return extent ? gridLinesFor(extent, GRID_LINES, this.box) : [];
  });

  /**
   * One arrow per sparsely chosen day — the same thinning the date axis uses,
   * so a season's worth of days does not turn the band into a smear. Days with
   * an unrecognised or missing direction simply get none.
   */
  readonly arrows = computed(() => {
    const days = this.series();

    return labelIndices(days.length, MAX_ARROWS)
      .map((index) => {
        const day = days[index];
        // Asked here as well as inside lib-wind-arrow, because a day with no
        // usable direction should take up no slot at all rather than render an
        // empty one at a position of its own.
        if (windArrowRotation(day.windDirection) === null) return null;

        const speed = windSpeedKmh(day.windSpeed);

        return {
          leftPercent: xPercent(index, days.length, this.box),
          direction: day.windDirection,
          context: `${day.date}: ${speed === null ? '—' : speed} km/h`,
        };
      })
      .filter((arrow): arrow is NonNullable<typeof arrow> => arrow !== null);
  });
}
