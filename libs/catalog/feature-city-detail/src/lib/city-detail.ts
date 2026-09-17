import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, numberAttribute } from '@angular/core';
import { Router } from '@angular/router';
import { WeatherStore } from '@geo/catalog/data-access';
import {
  DetailRange,
  Observation,
  precipUnitLabel,
  windSpeedKmh,
} from '@geo/catalog/util-model';
import {
  ObservationChartsComponent,
  WindArrowComponent,
} from '@geo/catalog/ui-chart';
import { NoteEditorComponent } from '@geo/catalog/ui-card';
import { AuthStore } from '@geo/auth/data-access';

/** The range chips, in the order they are shown. */
const RANGES: { value: DetailRange; label: string }[] = [
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: 'season', label: 'Season' },
];

/**
 * One city's history: the chart over a chosen window, then the same days as a
 * list so each can carry a note.
 *
 * Lazily routed, so the chart code never lands in the initial bundle.
 */
@Component({
  selector: 'lib-city-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ObservationChartsComponent, NoteEditorComponent, WindArrowComponent],
  templateUrl: './city-detail.html',
})
export class CityDetailComponent implements OnInit {
  /** Bound from the route param via `withComponentInputBinding()`. */
  id = input.required({ transform: numberAttribute });

  readonly store = inject(WeatherStore);
  readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  readonly ranges = RANGES;

  readonly detail = computed(() => this.store.detail());

  /** The city's name, taken from the list data when it is already loaded. */
  readonly summary = computed(() =>
    this.store.summaries().find((s) => s.city.id === this.id()) ?? null,
  );

  /** Newest first: the list reads as a log, most recent at the top. */
  readonly days = computed(() => {
    const series = this.detail()?.series ?? [];
    return [...series].reverse();
  });

  ngOnInit() {
    // The list may not have been visited — its data backs the heading and the
    // note patching, so make sure it is there.
    if (this.store.summaries().length === 0) {
      this.store.loadSummaries();
    }
    this.store.openCityDetail(this.id());
  }

  selectRange(range: DetailRange) {
    this.store.setDetailRange(range);
  }

  back() {
    this.store.closeCityDetail();
    this.router.navigate(['/']);
  }

  saveNote(observationId: number, text: string) {
    this.store.saveNote({ observationId, text });
  }

  deleteNote(observationId: number) {
    this.store.deleteNote(observationId);
  }

  /** A gap is a gap: `0` is a real reading and must not be printed as "—". */
  format(value: number | null): string {
    return value === null ? '—' : String(value);
  }

  /** The unit travels with the reading — mm of rain, cm of snow. */
  precipUnit(day: Observation): string {
    return precipUnitLabel(day.precipUnit);
  }

  /** The column holds knots; the reader expects km/h. */
  windKmh(day: Observation): number | null {
    return windSpeedKmh(day.windSpeed);
  }

}
