import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WeatherStore, ThemeService } from '@geo/catalog/data-access';
import { AuthStore } from '@geo/auth/data-access';

@Component({
  selector: 'lib-weather-list-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule],
  templateUrl: './weather-list-header.html',
})
export class WeatherListHeader {
  readonly store = inject(WeatherStore);
  readonly themeService = inject(ThemeService);
  readonly authStore = inject(AuthStore);

  isFiltersVisible = signal(true);

  // Dialog & Form State
  isAddCityModalOpen = signal(false);
  isNewArea = signal(false);

  cityName = signal('');
  citySlug = signal('');
  selectedAreaId = signal<string>('');
  newAreaName = signal('');
  formError = signal<string | null>(null);

  toggleFilters() {
    this.isFiltersVisible.update((v) => !v);
  }

  onAreaChange(area: string) {
    this.store.updateAreaFilter(area || null);
  }

  refresh() {
    this.store.loadSummaries();
  }

  scrapeNow() {
    const confirmed = window.confirm(
      'The current month will be refreshed for every city. Days already stored are overwritten with the archive\'s current values. Continue?'
    );
    if (confirmed) {
      this.store.scrapeNow();
    }
  }

  /**
   * Seeds the whole season. Worth a sterner confirmation than the daily run:
   * it is dozens of paced requests, so it takes minutes and holds the run lock
   * the entire time.
   */
  backfillSeason() {
    const confirmed = window.confirm(
      'Collect the whole season (April to the archive edge) for every city?\n\n' +
      'Requests are paced so the source is not overwhelmed, so this takes a few minutes. ' +
      'Months already stored in full are skipped.'
    );
    if (confirmed) {
      this.store.backfillSeason();
    }
  }

  /** Tooltip for the collect buttons — explains why they are disabled mid-run. */
  scrapeNowTitle(): string {
    return this.store.activeRun()
      ? 'A run is already in progress'
      : 'Collect data for every city';
  }

  backfillTitle(): string {
    return this.store.activeRun() ? 'A run is already in progress' : 'Collect the whole season';
  }

  openAddCityModal() {
    this.cityName.set('');
    this.citySlug.set('');
    this.selectedAreaId.set('');
    this.newAreaName.set('');
    this.isNewArea.set(false);
    this.formError.set(null);
    this.store.loadAreas();
    this.isAddCityModalOpen.set(true);
  }

  closeAddCityModal() {
    this.isAddCityModalOpen.set(false);
  }

  submitCity() {
    const name = this.cityName().trim();
    const slug = this.citySlug().trim().toLowerCase();
    const isNew = this.isNewArea();
    const areaId = this.selectedAreaId();
    const areaName = this.newAreaName().trim();

    if (!name) {
      this.formError.set('City name is required');
      return;
    }
    if (!slug) {
      this.formError.set('City id is required (for example, pietralta)');
      return;
    }
    if (isNew && !areaName) {
      this.formError.set('New area name is required');
      return;
    }
    if (!isNew && !areaId) {
      this.formError.set('Choose an area from the list');
      return;
    }

    this.formError.set(null);

    const payload = {
      name,
      slug,
      areaId: isNew ? null : Number(areaId),
      areaName: isNew ? areaName : undefined
    };

    this.store.createCity(payload);
    this.closeAddCityModal();
  }
}
