import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  // Names of the areas currently collapsed
  collapsedAreas = signal<string[]>(this.getInitialCollapsedAreas());

  constructor() {
    effect(() => {
      localStorage.setItem('collapsedAreas', JSON.stringify(this.collapsedAreas()));
    });
  }

  toggleArea(name: string) {
    this.collapsedAreas.update((list) => 
      list.includes(name) ? list.filter(n => n !== name) : [...list, name]
    );
  }

  isExpanded(name: string): boolean {
    return !this.collapsedAreas().includes(name);
  }

  private getInitialCollapsedAreas(): string[] {
    const saved = localStorage.getItem('collapsedAreas');
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }
}
