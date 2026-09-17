import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
}

const initialState: ToastState = {
  toasts: [],
};

export const ToastStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    show(message: string, type: ToastType = 'info', duration = 5000) {
      const id = Date.now();
      const newToast: Toast = { id, message, type };
      
      patchState(store, (state) => ({
        toasts: [...state.toasts, newToast],
      }));

      if (duration > 0) {
        setTimeout(() => {
          this.remove(id);
        }, duration);
      }
    },
    remove(id: number) {
      patchState(store, (state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    },
    showSuccess(message: string) {
      this.show(message, 'success');
    },
    showError(message: string) {
      this.show(message, 'error');
    },
  }))
);
