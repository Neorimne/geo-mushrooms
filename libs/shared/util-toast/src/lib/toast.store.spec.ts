import { TestBed } from '@angular/core/testing';
import { ToastStore } from './toast.store';

describe('ToastStore', () => {
  let store: InstanceType<typeof ToastStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ToastStore],
    });
    store = TestBed.inject(ToastStore);
  });

  it('should be created with empty toasts', () => {
    expect(store.toasts()).toEqual([]);
  });

  it('should add a toast', () => {
    store.show('Test message', 'success');
    expect(store.toasts().length).toBe(1);
    expect(store.toasts()[0].message).toBe('Test message');
    expect(store.toasts()[0].type).toBe('success');
  });

  it('should remove a toast', () => {
    store.show('Test', 'info');
    const id = store.toasts()[0].id;
    store.remove(id);
    expect(store.toasts()).toEqual([]);
  });

  it('should handle showSuccess helper', () => {
    store.showSuccess('Success!');
    expect(store.toasts()[0].type).toBe('success');
  });
});
