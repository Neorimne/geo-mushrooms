import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Note } from '@geo/catalog/data-access';

/**
 * The hand-written note on one observed day: add, edit, delete.
 *
 * Presentational only — it emits and lets the feature layer call the store, so
 * the same editor works in the list and in the detail view without either of
 * them owning the other's state.
 */
@Component({
  selector: 'lib-note-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  // Without an explicit block the inline host box overlaps its own block-level
  // children and intercepts clicks meant for them.
  host: { class: 'block' },
  template: `
    @if (isEditing()) {
      <div class="flex flex-col gap-2">
        <textarea
          [ngModel]="draft()"
          (ngModelChange)="draft.set($event)"
          rows="3"
          maxlength="2000"
          placeholder="Your note for this day…"
          class="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 p-2 resize-none focus:outline-hidden focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500"
        ></textarea>
        <div class="flex gap-2 justify-end">
          <button
            (click)="cancel()"
            class="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            (click)="submit()"
            [disabled]="!draft().trim()"
            class="px-3 py-1.5 text-xs font-bold bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    } @else if (note()) {
      <div class="flex items-start gap-2">
        <div class="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
          <div class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
            Note
          </div>
          {{ note()?.text }}
        </div>
        <div class="flex shrink-0 gap-1">
          <button
            (click)="startEdit()"
            title="Edit note"
            class="p-1 rounded-sm text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            (click)="remove()"
            title="Delete note"
            class="p-1 rounded-sm text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    } @else {
      <button
        (click)="startEdit()"
        class="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add a note
      </button>
    }
  `,
})
export class NoteEditorComponent {
  note = input<Note | null>(null);

  saved = output<string>();
  deleted = output<void>();

  readonly isEditing = signal(false);
  readonly draft = signal('');

  /** Whether this day carries a note — lets a parent show an indicator. */
  readonly hasNote = computed(() => this.note() !== null);

  startEdit() {
    this.draft.set(this.note()?.text ?? '');
    this.isEditing.set(true);
  }

  cancel() {
    this.isEditing.set(false);
    this.draft.set('');
  }

  submit() {
    const text = this.draft().trim();
    if (!text) return;
    this.saved.emit(text);
    this.isEditing.set(false);
    this.draft.set('');
  }

  remove() {
    this.deleted.emit();
    this.isEditing.set(false);
    this.draft.set('');
  }
}
