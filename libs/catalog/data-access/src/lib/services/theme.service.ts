import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // Current theme (true = dark, false = light)
  isDarkMode = signal<boolean>(this.getInitialTheme());

  constructor() {
    // On every change, toggle the class on <html> and persist to localStorage
    effect(() => {
      const isDark = this.isDarkMode();
      if (isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  toggle() {
    this.isDarkMode.update((v) => !v);
  }

  private getInitialTheme(): boolean {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';

    // Default to dark mode
    return true;
  }
}
