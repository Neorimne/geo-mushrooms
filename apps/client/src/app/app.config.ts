import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { environment } from '../environments/environment';
import { API_URL } from '@geo/shared/util-config';
import { authInterceptor } from '@geo/auth/data-access';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding lets the city detail read :id as a signal input
    // rather than subscribing to ActivatedRoute.
    provideRouter(appRoutes, withComponentInputBinding()),
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    {
      provide: API_URL,
      useValue: environment.apiUrl,
    },
  ],
};
