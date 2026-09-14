import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ThemeService } from '@geo/catalog/data-access';
import { ToastComponent } from '@geo/shared/ui-toast';

@Component({
  imports: [RouterModule, ToastComponent],
  selector: 'app-root',
  template: `
    <lib-toast />
    <router-outlet></router-outlet>
  `,
  styles: [],
})
export class AppComponent {
  // Never read: constructing ThemeService is what applies the stored theme to
  // <html>. Deleting this field silently drops dark mode on first paint.
  private readonly themeService = inject(ThemeService);
}
