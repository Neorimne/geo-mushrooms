import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Note } from '@geo/catalog/data-access';
import { NoteEditorComponent } from './note-editor';

const NOTE: Note = {
  id: 7,
  observationId: 11,
  text: 'Porcini by the lake',
  createdAt: '2026-08-19T10:00:00.000Z',
  updatedAt: '2026-08-19T10:00:00.000Z',
};

describe('NoteEditorComponent', () => {
  let fixture: ComponentFixture<NoteEditorComponent>;
  let component: NoteEditorComponent;

  const text = () => fixture.nativeElement.textContent as string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NoteEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NoteEditorComponent);
    component = fixture.componentInstance;
  });

  it('offers to add a note when there is none', () => {
    fixture.componentRef.setInput('note', null);
    fixture.detectChanges();

    expect(text()).toContain('Add a note');
    expect(component.hasNote()).toBe(false);
  });

  it('shows an existing note instead of the add button', () => {
    fixture.componentRef.setInput('note', NOTE);
    fixture.detectChanges();

    expect(text()).toContain('Porcini by the lake');
    expect(text()).not.toContain('Add a note');
    expect(component.hasNote()).toBe(true);
  });

  it('starts editing an existing note pre-filled with its text', () => {
    fixture.componentRef.setInput('note', NOTE);
    fixture.detectChanges();

    component.startEdit();

    expect(component.isEditing()).toBe(true);
    expect(component.draft()).toBe('Porcini by the lake');
  });

  it('emits the trimmed text on save and leaves edit mode', () => {
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.startEdit();
    component.draft.set('  Mushrooms by the river  ');

    component.submit();

    expect(saved).toHaveBeenCalledWith('Mushrooms by the river');
    expect(component.isEditing()).toBe(false);
    expect(component.draft()).toBe('');
  });

  it('refuses to save an empty note', () => {
    // Saving nothing would create a blank row the user then has to delete.
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.startEdit();
    component.draft.set('   ');

    component.submit();

    expect(saved).not.toHaveBeenCalled();
    expect(component.isEditing()).toBe(true);
  });

  it('drops the draft on cancel without emitting', () => {
    const saved = jest.fn();
    component.saved.subscribe(saved);
    component.startEdit();
    component.draft.set('changed my mind');

    component.cancel();

    expect(saved).not.toHaveBeenCalled();
    expect(component.isEditing()).toBe(false);
    expect(component.draft()).toBe('');
  });

  it('emits a delete and closes the editor', () => {
    const deleted = jest.fn();
    component.deleted.subscribe(deleted);
    fixture.componentRef.setInput('note', NOTE);
    fixture.detectChanges();
    component.startEdit();

    component.remove();

    expect(deleted).toHaveBeenCalled();
    expect(component.isEditing()).toBe(false);
  });
});
