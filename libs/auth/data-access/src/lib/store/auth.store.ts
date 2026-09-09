import {
  patchState,
  signalStore,
  withMethods,
  withState,
  withComputed,
  withHooks,
} from '@ngrx/signals';
import { inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap } from 'rxjs';
import { tap } from 'rxjs/operators';
import { tapResponse } from '@ngrx/operators';
import { Router } from '@angular/router';
import { API_URL } from '@geo/catalog/data-access';

const TOKEN_KEY = 'auth_token';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

type AuthState = {
  token: string | null;
  isLoading: boolean;
  error: string | null;
};

const initialState: AuthState = {
  token: null,
  isLoading: false,
  error: null,
};

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ token }) => ({
    isAuthenticated: computed(() => !!token()),
  })),

  withHooks({
    onInit(store) {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      if (savedToken) {
        // Check token expiry (exp claim)
        if (isTokenExpired(savedToken)) {
          localStorage.removeItem(TOKEN_KEY);
          patchState(store, { token: null });
        } else {
          patchState(store, { token: savedToken });
        }
      }
    },
  }),

  withMethods((store, http = inject(HttpClient), router = inject(Router), apiUrl = inject(API_URL)) => {
    // ...
    const login = rxMethod<{ email: string; password: string }>(
      pipe(
        tap(() => patchState(store, { isLoading: true, error: null })),
        switchMap(({ email, password }) =>
          http
            .post<{ access_token: string }>(`${apiUrl}/auth/login`, {
              email,
              password,
            })
            .pipe(
              tapResponse({
                next: ({ access_token }) => {
                  localStorage.setItem(TOKEN_KEY, access_token);
                  patchState(store, { token: access_token, isLoading: false });
                  router.navigate(['/']);
                },
                error: (err: unknown) => {
                  const errorResponse = err as { error?: { message?: string } };
                  const message =
                    errorResponse?.error?.message || 'Login failed. Check credentials.';
                  patchState(store, { isLoading: false, error: message });
                },
              })
            )
        )
      )
    );

    return {
      login,
      logout() {
        localStorage.removeItem(TOKEN_KEY);
        patchState(store, { token: null, error: null });
        router.navigate(['/login']);
      },
    };
  })
);
