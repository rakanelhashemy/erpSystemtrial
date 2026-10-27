import {  Service, signal } from '@angular/core';
import { BRANDING_CONFIG } from '../config/branding.config';

@Service()
export class BrandingService {
  readonly companyName = signal(BRANDING_CONFIG.companyName);
  readonly systemName = signal(BRANDING_CONFIG.systemName);
}
