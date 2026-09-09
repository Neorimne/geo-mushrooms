import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import {
  Observation,
  precipUnitLabel,
  windSpeedKmh,
} from '@geo/catalog/data-access';
import {
  AXIS_GUTTER_PX,
  DAILY_CHART_BOX,
  formatDayLabel,
  indexAtFraction,
  xPercent,
} from './chart-geometry';
import { DailyChartComponent } from './daily-chart';
import { WindChartComponent } from './wind-chart';
import { HumidityChartComponent } from './humidity-chart';
import { WindArrowComponent } from './wind-arrow';

/**
 * All three panels share a width and horizontal padding, so any one of them
 * answers "where is day n" for the whole stack.
 */
const HOVER_BOX = DAILY_CHART_BOX;

/** Past this much of the width the readout flips to the other side. */
const FLIP_AFTER_PERCENT = 60;

/** One day as the readout prints it. */
interface Readout {
  leftPercent: number;
  flipped: boolean;
  date: string;
  tMax: string;
  tMin: string;
  precip: string;
  wind: string;
  windDirection: string | null;
  humidity: string;
}

/**
 * The city detail chart: temperature and precipitation, then wind, then
 * humidity, stacked and read with one crosshair.
 *
 * The panels stay separate — °C, mm, km/h and % on one y axis would be
 * meaningless, and four series in one box is unreadable on the phone this app
 * is built for. What makes them *comparable* is not a shared scale but a shared
 * moment: the crosshair lines them up on one day and the readout answers for
 * all of them at once, which is the question a forager actually asks ("what was
 * it like the day the mushrooms came up?").
 *
 * Hover state lives here rather than in each panel: one overlay, one crosshair,
 * one tooltip. The panels themselves stay unaware of it and independently
 * testable.
 */
@Component({
  selector: 'lib-observation-charts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DailyChartComponent,
    WindChartComponent,
    HumidityChartComponent,
    WindArrowComponent,
  ],
  template: `
    <div class="relative">
      <lib-daily-chart [series]="series()" />
      <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        <lib-wind-chart [series]="series()" />
      </div>
      <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        <lib-humidity-chart [series]="series()" />
      </div>

      <!-- Everything that speaks in plot percentages lives in this layer, and
           the layer starts where the plots start: the axis gutter is real
           pixels outside the SVG, so an overlay across the whole card would
           put the crosshair a gutter's width off the day it names. -->
      <div class="absolute inset-y-0 right-0" [style.left.px]="gutter">
        @if (readout(); as day) {
          <!-- One line down the whole stack: the three panels are read together
               or there was no point stacking them. -->
          <div
            class="absolute inset-y-0 w-px bg-slate-400/70 dark:bg-slate-400/50 pointer-events-none"
            [style.left.%]="day.leftPercent"
          ></div>

          <div
            class="absolute top-1 z-20 pointer-events-none rounded-lg border border-slate-200 dark:border-slate-600 bg-white/95 dark:bg-slate-900/95 px-2.5 py-2 shadow-lg text-xs whitespace-nowrap"
            [style.left.%]="day.leftPercent"
            [style.transform]="
              day.flipped ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)'
            "
          >
            <div class="font-bold text-slate-700 dark:text-slate-200 mb-1">
              {{ day.date }}
            </div>
            <div class="flex items-baseline gap-1.5 tabular-nums">
              <span class="font-bold text-orange-500 dark:text-orange-400">{{ day.tMax }}°</span>
              <span class="font-semibold text-blue-500 dark:text-blue-400">{{ day.tMin }}°</span>
            </div>
            <div class="mt-0.5 text-slate-500 dark:text-slate-400 tabular-nums">
              precipitation {{ day.precip }}
            </div>
            <div class="text-slate-500 dark:text-slate-400 tabular-nums inline-flex items-center gap-1">
              wind {{ day.wind }}
              <lib-wind-arrow
                class="text-teal-600 dark:text-teal-400"
                [direction]="day.windDirection"
                [showLabel]="true"
              />
            </div>
            <div class="text-slate-500 dark:text-slate-400 tabular-nums">
              humidity {{ day.humidity }}
            </div>
          </div>
        }

        <!-- Pointer events, not mouse events: a phone has no hover, and this app
             is used on one in the field. Touch and drag moves the readout, while
             touch-pan-y leaves vertical page scrolling alone. -->
        <div
          class="absolute inset-0 z-10 touch-pan-y"
          (pointermove)="track($event)"
          (pointerdown)="track($event)"
          (pointerleave)="clear()"
          (pointercancel)="clear()"
        ></div>
      </div>
    </div>
  `,
})
export class ObservationChartsComponent {
  series = input.required<Observation[]>();

  /** The overlay is inset by this, so its own width is the plot's width. */
  readonly gutter = AXIS_GUTTER_PX;

  private readonly hoveredIndex = signal<number | null>(null);

  track(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    if (rect.width === 0) return;

    const fraction = (event.clientX - rect.left) / rect.width;
    this.hoveredIndex.set(
      indexAtFraction(fraction, this.series().length, HOVER_BOX),
    );
  }

  clear() {
    this.hoveredIndex.set(null);
  }

  readonly readout = computed<Readout | null>(() => {
    const index = this.hoveredIndex();
    const days = this.series();
    if (index === null) return null;

    const day = days[index];
    if (!day) return null;

    const leftPercent = xPercent(index, days.length, HOVER_BOX);

    return {
      leftPercent,
      flipped: leftPercent > FLIP_AFTER_PERCENT,
      date: formatDayLabel(day.date),
      tMax: format(day.tMax),
      tMin: format(day.tMin),
      // The unit travels with the amount — mm of rain, cm of snow.
      precip: `${format(day.precipAmount)} ${precipUnitLabel(day.precipUnit)}`,
      wind: `${format(windSpeedKmh(day.windSpeed))} km/h`,
      windDirection: day.windDirection,
      humidity: `${format(day.humidity)}%`,
    };
  });
}

/** A gap is a gap: `0` is a real reading and must not be printed as "—". */
function format(value: number | null): string {
  return value === null ? '—' : String(value);
}
