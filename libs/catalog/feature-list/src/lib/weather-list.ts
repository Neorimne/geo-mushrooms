import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  WeatherStore,
  ThemeService,
  LayoutService,
} from '@geo/catalog/data-access';
import { CitySummaryCardComponent } from '@geo/catalog/ui-card';
import { WeatherListHeader } from './header/weather-list-header';
import { AuthStore } from '@geo/auth/data-access';

interface PendingScrape {
  type: 'city' | 'region';
  id: number;
  name: string;
  cityCount?: number; // regions only — shown in the confirmation dialog
}

interface PendingDelete {
  type: 'city' | 'region';
  id: number;
  name: string;
}

@Component({
  selector: 'lib-weather-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CitySummaryCardComponent, WeatherListHeader],
  templateUrl: 'weather-list.html',
})
export class WeatherListComponent implements OnInit {
  readonly store = inject(WeatherStore);
  readonly themeService = inject(ThemeService);
  readonly layoutService = inject(LayoutService);
  readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  /**
   * '1 city' / '3 cities'. English needs only the singular/plural split, so this
   * is a method rather than the rule module it replaced — that module existed
   * for Russian, where the form depends on the last two digits of the count.
   */
  citiesLabel(count: number): string {
    return `${count} ${count === 1 ? 'city' : 'cities'}`;
  }

  pendingScrape = signal<PendingScrape | null>(null);
  pendingDelete = signal<PendingDelete | null>(null);

  ngOnInit() {
    this.store.loadSummaries();
    this.store.loadConfig();
    // Picks up a run already in flight, so a reload mid-collection keeps the progress bar.
    this.store.pollActiveRun();
  }

  openCity(cityId: number) {
    this.router.navigate(['city', cityId]);
  }

  requestScrapeCity(cityId: number, cityName: string) {
    this.pendingScrape.set({ type: 'city', id: cityId, name: cityName });
  }

  requestScrapeRegion(areaId: number, areaName: string, cityCount: number) {
    this.pendingScrape.set({ type: 'region', id: areaId, name: areaName, cityCount });
  }

  confirmScrape() {
    const action = this.pendingScrape();
    if (!action) return;
    if (action.type === 'city') {
      this.store.scrapeCity(action.id);
    } else {
      this.store.scrapeRegion(action.id);
    }
    this.pendingScrape.set(null);
  }

  cancelScrape() {
    this.pendingScrape.set(null);
  }

  requestDeleteCity(cityId: number, cityName: string) {
    this.pendingDelete.set({ type: 'city', id: cityId, name: cityName });
  }

  requestDeleteRegion(areaId: number, areaName: string) {
    this.pendingDelete.set({ type: 'region', id: areaId, name: areaName });
  }

  confirmDelete() {
    const action = this.pendingDelete();
    if (!action) return;
    if (action.type === 'city') {
      this.store.deleteLatestCity(action.id);
    } else {
      this.store.deleteLatestRegion(action.id);
    }
    this.pendingDelete.set(null);
  }

  cancelDelete() {
    this.pendingDelete.set(null);
  }
}
