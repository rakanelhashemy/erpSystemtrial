import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../../core/services/branding.service';
import { AppLanguage, AuthService } from '../../core/auth/auth-service/auth-service';

@Component({
  imports: [FormsModule],
  selector: 'app-settings',
  styleUrl: './settings.component.css',
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  readonly branding = inject(BrandingService);
  readonly auth = inject(AuthService);

  setLanguage(language: AppLanguage): void {
    this.auth.setLanguage(language);
  }
}
