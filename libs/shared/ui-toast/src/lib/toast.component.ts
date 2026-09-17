import { Component, inject } from '@angular/core';
import { ToastStore, ToastType } from '@geo/shared/util-toast';

/**
 * One class string per toast type.
 * The background is deliberately opaque: toasts float above cards and tables,
 * and translucency made the text unreadable.
 */
const TOAST_CLASSES: Record<ToastType, string> = {
  success:
    'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200',
  error:
    'bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-200',
  warning:
    'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200',
  info: 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-200',
};

@Component({
  selector: 'lib-toast',
  imports: [],
  template: `
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      @for (toast of toastStore.toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex w-80 items-start gap-4 rounded-xl border p-4 shadow-2xl transition-all duration-300 animate-in slide-in-from-right-full"
          [class]="toastClasses[toast.type]"
        >
          <!-- Icon -->
          <span class="shrink-0 text-xl" aria-hidden="true">
            @switch (toast.type) {
              @case ('success') { <span>✅</span> }
              @case ('error') { <span>❌</span> }
              @case ('warning') { <span>⚠️</span> }
              @case ('info') { <span>ℹ️</span> }
            }
          </span>

          <!-- Content -->
          <div class="flex-1 text-sm font-medium leading-5">
            {{ toast.message }}
          </div>

          <!-- Close -->
          <button
            (click)="toastStore.remove(toast.id)"
            class="shrink-0 transition-opacity hover:opacity-70 opacity-40 focus:outline-hidden"
            aria-label="Close"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class ToastComponent {
  protected readonly toastStore = inject(ToastStore);
  protected readonly toastClasses = TOAST_CLASSES;
}
