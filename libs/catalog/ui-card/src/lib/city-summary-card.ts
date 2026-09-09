import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  CitySummary,
  isFresh,
  precipUnitLabel,
  windSpeedKmh,
} from '@geo/catalog/data-access';
import { SparklineComponent, WindArrowComponent } from '@geo/catalog/ui-chart';

/**
 * One city's row in the list: the latest day's numbers, a fortnight sparkline,
 * and whether the data is as fresh as it can be.
 *
 * Mobile-first — the stats wrap into a grid rather than a strip, so the card
 * reads on a phone held in one hand in the field.
 */
@Component({
  selector: 'lib-city-summary-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SparklineComponent, WindArrowComponent],
  host: { class: 'block' },
  template: `
    <button
      type="button"
      (click)="opened.emit()"
      class="w-full text-left bg-white dark:bg-slate-800 rounded-xl shadow-xs border border-slate-200 dark:border-slate-700 p-4 transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-blue-400"
      [attr.aria-label]="'Open history: ' + summary().city.name"
    >
      <!-- Heading: day, freshness, note marker -->
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">
            @if (latest(); as day) { {{ day.date }} } @else { no data }
          </span>
          @if (hasNote()) {
            <span title="Has a note" class="shrink-0 text-blue-500 dark:text-blue-400" aria-label="Has a note">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
          }
        </div>

        @if (fresh()) {
          <span class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            title="The archive validates its last two days before publishing them — nothing fresher exists">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            up to date
          </span>
        } @else {
          <span class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
            title="This city is behind the archive — its newest collected day is older than the rest">
            <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            @if (latest()) { not updated } @else { no data }
          </span>
        }
      </div>

      @if (latest(); as day) {
        <div class="flex items-center gap-4">
          <!-- Temperature: the headline number -->
          <div class="flex items-baseline gap-1.5 shrink-0">
            <span class="text-2xl font-extrabold text-orange-500 dark:text-orange-400 tabular-nums">
              {{ format(day.tMax) }}°
            </span>
            <span class="text-base font-bold text-blue-500 dark:text-blue-400 tabular-nums">
              {{ format(day.tMin) }}°
            </span>
          </div>

          <div class="flex-1 min-w-0"></div>

          <!-- A fortnight at a glance -->
          <div class="shrink-0 flex items-center" [attr.aria-hidden]="true">
            <lib-sparkline [series]="summary().series" />
          </div>
        </div>

        <!-- Secondary metrics, wrapping on narrow screens -->
        <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div class="flex flex-col">
            <span class="text-slate-400 dark:text-slate-500">precip.</span>
            <span class="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {{ format(day.precipAmount) }} {{ precipUnit() }}
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-slate-400 dark:text-slate-500">wind</span>
            <!-- The direction in words, not only as an arrow: this card is read
                 on a phone, where a <title> tooltip never opens. -->
            <span class="font-semibold text-slate-700 dark:text-slate-200 tabular-nums inline-flex items-center gap-1">
              {{ format(windKmh()) }} km/h
              <lib-wind-arrow [direction]="windDirection()" [showLabel]="true" />
            </span>
          </div>
          <div class="flex flex-col">
            <span class="text-slate-400 dark:text-slate-500">humidity</span>
            <span class="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {{ format(day.humidity) }}%
            </span>
          </div>
        </div>
      } @else {
        <p class="text-sm text-slate-400 dark:text-slate-500">
          Nothing collected yet — start a run for this city.
        </p>
      }
    </button>
  `,
})
export class CitySummaryCardComponent {
  summary = input.required<CitySummary>();

  opened = output<void>();

  readonly latest = computed(() => this.summary().latest);
  readonly fresh = computed(() => isFresh(this.summary()));
  readonly hasNote = computed(() =>
    this.summary().series.some((o) => o.note !== null),
  );

  /**
   * The unit travels with the reading: the source sends mm of rain but cm of
   * snow, so hardcoding "mm" would mislabel every winter day.
   */
  readonly precipUnit = computed(() =>
    precipUnitLabel(this.latest()?.precipUnit ?? null),
  );

  /** The column holds knots; the reader expects km/h. */
  readonly windKmh = computed(() =>
    windSpeedKmh(this.latest()?.windSpeed ?? null),
  );

  /** The raw compass code; `lib-wind-arrow` turns it into a glyph and a word. */
  readonly windDirection = computed(
    () => this.latest()?.windDirection ?? null,
  );

  /** A gap is a gap: `0` is a real reading and must not be printed as "—". */
  format(value: number | null): string {
    return value === null ? '—' : String(value);
  }
}
