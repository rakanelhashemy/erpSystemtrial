import { Component, computed, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgxSonnerToaster } from 'ngx-sonner';
import { Title } from '@angular/platform-browser';
import { BrandingService } from './core/services/branding.service';
import { AuthService } from './core/auth/auth-service/auth-service';

@Component({
  imports: [RouterOutlet, NgxSonnerToaster],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly title = inject(Title);
  private readonly branding = inject(BrandingService);
  private readonly auth = inject(AuthService);
  readonly toastPosition = computed(() => this.auth.language() === 'ar' ? 'top-left' : 'top-right');

  constructor() {
    effect(() =>
      this.title.setTitle(`${this.branding.systemName()} | ${this.branding.companyName()}`),
    );
    effect(() => {
      const language = this.auth.language();
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    });
  }
}
