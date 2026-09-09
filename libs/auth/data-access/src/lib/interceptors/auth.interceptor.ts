import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../store/auth.store';
import { ToastStore } from '@geo/shared/ui-toast';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const toastStore = inject(ToastStore);
  const token = authStore.token();

  const cloned = token
    ? req.clone({
        headers: req.headers.set('Authorization', `Bearer ${token}`),
      })
    : req;

  return next(cloned).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authStore.logout();
      } else {
        const errorMsg = error.error?.message || error.message || 'An unexpected error occurred';
        toastStore.showError(errorMsg);
      }
      return throwError(() => error);
    })
  );
};
