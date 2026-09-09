import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Observation } from '@geo/catalog/data-access';
import {
  Extent,
  SECONDARY_CHART_BOX,
  gridLinesFor,
  toLinePath,
} from './chart-geometry';
import { ChartFrameComponent } from './chart-frame';

/**
 * Relative humidity is a percentage, so the axis is the whole percentage.
 *
 * Fitting the scale to the data instead would turn a 70→80% drift into a cliff
 * and, worse, give every city a different axis — the one comparison a forager
 * actually makes between two pages would stop working.
 */
const HUMIDITY_EXTENT: Extent = { min: 0, max: 100 };

/** 0 / 25 / 50 / 75 / 100. */
const GRID_LINES = 4;

/**
 * Daily mean humidity under the main chart.
 *
 * One value per day is all the archive has: a dry afternoon inside a foggy day
 * is invisible here. The hourly series that would show it exists at the source
 * but sits behind a subscription, so this is the honest resolution.
 */
@Component({
  selector: 'lib-humidity-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartFrameComponent],
  template: `
    @if (hasData()) {
      <lib-chart-frame [ticks]="gridLines">
        <svg
          [attr.viewBox]="viewBox"
          class="block w-full h-28 sm:h-36"
          preserveAspectRatio="none"
          role="img"
          aria-label="Daily humidity"
        >
          <!-- Rules only; the percentages beside them are HTML, laid out by
               lib-chart-frame at a real font size. -->
          @for (line of gridLines; track $index) {
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
            [attr.d]="humidityPath()"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="stroke-indigo-500 dark:stroke-indigo-400"
          />
        </svg>
      </lib-chart-frame>

      <div class="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span class="w-3 h-0.5 rounded-full bg-indigo-500 dark:bg-indigo-400"></span>
        Humidity, % — daily mean
      </div>
    } @else {
      <div class="flex items-center justify-center h-28 text-sm text-slate-400 dark:text-slate-500">
        No humidity data for the selected range
      </div>
    }
  `,
})
export class HumidityChartComponent {
  series = input.required<Observation[]>();

  readonly box = SECONDARY_CHART_BOX;
  readonly viewBox = `0 0 ${SECONDARY_CHART_BOX.width} ${SECONDARY_CHART_BOX.height}`;

  private readonly humidity = computed(() =>
    this.series().map((o) => o.humidity),
  );

  readonly hasData = computed(() =>
    this.humidity().some((value) => value !== null),
  );

  readonly humidityPath = computed(() =>
    toLinePath(this.humidity(), HUMIDITY_EXTENT, this.box),
  );

  readonly gridLines = gridLinesFor(
    HUMIDITY_EXTENT,
    GRID_LINES,
    SECONDARY_CHART_BOX,
  );
}
