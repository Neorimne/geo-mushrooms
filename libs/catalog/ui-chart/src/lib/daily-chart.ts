import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Observation, precipInMm } from '@geo/catalog/data-access';
import {
  DAILY_CHART_BOX,
  Extent,
  extentOf,
  formatDayLabel,
  gridLinesFor,
  labelIndices,
  padExtent,
  toBandPath,
  toBars,
  toLinePath,
  xPercent,
} from './chart-geometry';
import { ChartFrameComponent } from './chart-frame';

/** How many horizontal gridlines the temperature axis gets. */
const GRID_LINES = 4;

/**
 * The city detail chart: the daily temperature range as a band with its two
 * bounding lines, and precipitation as bars on a separate scale underneath.
 *
 * Both metrics share the x axis but never the y axis — millimetres and degrees
 * on one scale would be meaningless. Colour and theme come entirely from
 * Tailwind classes on the SVG elements, so dark mode needs no JS at all.
 */
@Component({
  selector: 'lib-daily-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartFrameComponent],
  template: `
    @if (hasData()) {
      <lib-chart-frame [ticks]="gridLines()" [dateLabels]="dateLabels()">
        <svg
          [attr.viewBox]="viewBox"
          class="block w-full h-56 sm:h-72"
          preserveAspectRatio="none"
          role="img"
          aria-label="Daily temperature and precipitation"
        >
          <!-- Rules only. The values beside them are printed by lib-chart-frame,
               in HTML: text drawn in here is stretched by whatever ratio the
               container has. -->
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

          <!-- Precipitation, on its own scale from the baseline up -->
          @for (bar of bars(); track $index) {
            <rect
              [attr.x]="bar.x"
              [attr.y]="bar.y"
              [attr.width]="bar.width"
              [attr.height]="bar.height"
              rx="1"
              class="fill-sky-200/70 dark:fill-sky-800/60"
            />
          }

          <!-- The day's temperature range -->
          <path [attr.d]="bandPath()" class="fill-orange-200/40 dark:fill-orange-500/15" />
          <path
            [attr.d]="tMaxPath()"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="stroke-orange-500 dark:stroke-orange-400"
          />
          <path
            [attr.d]="tMinPath()"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="stroke-blue-500 dark:stroke-blue-400"
          />
        </svg>
      </lib-chart-frame>

      <!-- Legend -->
      <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 rounded-full bg-orange-500 dark:bg-orange-400"></span>
          Max °C
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-0.5 rounded-full bg-blue-500 dark:bg-blue-400"></span>
          Min °C
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-xs bg-sky-200 dark:bg-sky-800"></span>
          Precipitation@if (precipPeak() !== null) {, up to {{ precipPeak() }} mm}
        </span>
      </div>
    } @else {
      <div class="flex items-center justify-center h-56 text-sm text-slate-400 dark:text-slate-500">
        No data for the selected range
      </div>
    }
  `,
})
export class DailyChartComponent {
  series = input.required<Observation[]>();

  readonly box = DAILY_CHART_BOX;
  readonly viewBox = `0 0 ${DAILY_CHART_BOX.width} ${DAILY_CHART_BOX.height}`;

  private readonly tMin = computed(() => this.series().map((o) => o.tMin));
  private readonly tMax = computed(() => this.series().map((o) => o.tMax));
  /**
   * Bars share one scale, so the amounts are converted to millimetres first —
   * a snow day arrives in centimetres and would otherwise draw ten times short.
   */
  private readonly precip = computed(() =>
    this.series().map((o) => precipInMm(o.precipAmount, o.precipUnit)),
  );

  /** One shared, padded scale for both temperature series. */
  private readonly tempExtent = computed<Extent | null>(() => {
    const extent = extentOf(this.tMin(), this.tMax());
    return extent ? padExtent(extent, 0.12) : null;
  });

  readonly hasData = computed(() => this.tempExtent() !== null);

  readonly bandPath = computed(() => {
    const extent = this.tempExtent();
    if (!extent) return '';
    return toBandPath(this.tMin(), this.tMax(), extent, this.box);
  });

  readonly tMaxPath = computed(() => {
    const extent = this.tempExtent();
    return extent ? toLinePath(this.tMax(), extent, this.box) : '';
  });

  readonly tMinPath = computed(() => {
    const extent = this.tempExtent();
    return extent ? toLinePath(this.tMin(), extent, this.box) : '';
  });

  readonly bars = computed(() => toBars(this.precip(), this.box, 0.5));

  readonly gridLines = computed(() => {
    const extent = this.tempExtent();
    return extent ? gridLinesFor(extent, GRID_LINES, this.box) : [];
  });

  /**
   * Sparse date labels — one per day would be a smear — as percentages of the
   * plot's width, which is what the frame lays them out in.
   */
  readonly dateLabels = computed(() => {
    const days = this.series();
    return labelIndices(days.length).map((index) => ({
      leftPercent: xPercent(index, days.length, this.box),
      text: formatDayLabel(days[index].date),
    }));
  });

  /** The wettest day in the window, so the bars' scale is not a mystery. */
  readonly precipPeak = computed(() => {
    const values = this.precip().filter((v): v is number => v !== null);
    if (!values.length) return null;
    // One decimal: the conversion from centimetres makes exact tenths common.
    return Math.round(Math.max(...values) * 10) / 10;
  });
}
