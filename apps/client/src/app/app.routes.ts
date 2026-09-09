import { Route } from '@angular/router';
import { authGuard } from '@geo/auth/data-access';

export const appRoutes: Route[] = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('@geo/catalog/feature-list').then((m) => m.WeatherListComponent),
  },
  {
    // Lazy on purpose: the chart code stays out of the initial bundle.
    path: 'city/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('@geo/catalog/feature-city-detail').then((m) => m.CityDetailComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('@geo/auth/feature-login').then((m) => m.LoginComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
