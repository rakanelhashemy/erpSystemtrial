import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgxSonnerToaster } from 'ngx-sonner';
import { Title } from '@angular/platform-browser';
import { BrandingService } from './core/services/branding.service';

@Component({
  imports: [RouterOutlet, NgxSonnerToaster],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly title = inject(Title);
  private readonly branding = inject(BrandingService);

  constructor() {
    effect(() =>
      this.title.setTitle(`${this.branding.systemName()} | ${this.branding.companyName()}`),
    );
  }
}
