import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from '../tokens/api-url.token';
import {
  Area,
  City,
  CitySummary,
  IngestionRun,
  Note,
  Observation,
} from '../models/observation.model';

@Injectable({ providedIn: 'root' })
export class WeatherApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  /** The list view: one row per city, latest day plus a trailing series. */
  getSummaries(days?: number) {
    const query = days ? `?days=${days}` : '';
    return this.http.get<CitySummary[]>(
      `${this.apiUrl}/observations/summary${query}`,
    );
  }

  /** The detail chart: one city over an explicit window. */
  getObservations(cityId: number, from: string, to: string) {
    return this.http.get<Observation[]>(
      `${this.apiUrl}/observations?cityId=${cityId}&from=${from}&to=${to}`,
    );
  }

  getLastUpdate() {
    return this.http.get<{ lastUpdate: string | null }>(
      `${this.apiUrl}/observations/last-update`,
    );
  }

  scrapeNow() {
    return this.http.post<IngestionRun>(`${this.apiUrl}/ingestion/runs`, null);
  }

  scrapeCity(cityId: number) {
    return this.http.post<IngestionRun>(`${this.apiUrl}/ingestion/runs/city/${cityId}`, null);
  }

  scrapeRegion(areaId: number) {
    return this.http.post<IngestionRun>(`${this.apiUrl}/ingestion/runs/region/${areaId}`, null);
  }

  /** Seeds the whole current season — many months per city, one request each. */
  backfillSeason() {
    return this.http.post<IngestionRun>(`${this.apiUrl}/ingestion/runs/backfill`, null);
  }

  getActiveRun() {
    return this.http.get<IngestionRun | null>(`${this.apiUrl}/ingestion/runs/active`);
  }

  getLatestRun() {
    return this.http.get<IngestionRun | null>(`${this.apiUrl}/ingestion/runs/latest`);
  }

  getConfig() {
    return this.http.get<{ devToolsEnabled: boolean }>(`${this.apiUrl}/config`);
  }

  deleteLatestCity(cityId: number) {
    return this.http.delete<{ deletedCount: number }>(
      `${this.apiUrl}/observations/latest/city/${cityId}`,
    );
  }

  deleteLatestRegion(areaId: number) {
    return this.http.delete<{ deletedCount: number }>(
      `${this.apiUrl}/observations/latest/region/${areaId}`,
    );
  }

  getAreas() {
    return this.http.get<Area[]>(`${this.apiUrl}/areas`);
  }

  createCity(cityData: { name: string; slug: string; areaId?: number | string | null; areaName?: string }) {
    return this.http.post<City>(`${this.apiUrl}/cities`, cityData);
  }

  upsertNote(observationId: number, text: string) {
    return this.http.put<Note>(
      `${this.apiUrl}/observations/${observationId}/note`,
      { text },
    );
  }

  deleteNote(observationId: number) {
    return this.http.delete<{ deletedCount: number }>(
      `${this.apiUrl}/observations/${observationId}/note`,
    );
  }
}
