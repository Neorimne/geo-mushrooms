import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
import { RouterModule } from '@angular/router';

/**
 * AppComponent injects ThemeService and never reads it — constructing the
 * service is the whole point, because its constructor effect is what puts the
 * `dark` class on <html>. These tests are what stands between that field and a
 * future "remove the unused injection" cleanup.
 */
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, RouterModule.forRoot([])],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem('theme');
    document.documentElement.classList.remove('dark');
  });

  it('applies the saved theme to the document root', () => {
    localStorage.setItem('theme', 'light');

    TestBed.createComponent(AppComponent).detectChanges();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('defaults to dark when nothing has been saved', () => {
    TestBed.createComponent(AppComponent).detectChanges();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
