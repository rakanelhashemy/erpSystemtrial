import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { BrandingService } from '../../../core/services/branding.service';
import { BusinessContextService } from '../../../core/services/business-context.service';

@Component({
  imports: [],
  selector: 'app-header',
  styleUrl: './header.component.css',
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  readonly branding = inject(BrandingService);
  readonly selectedBusiness = inject(BusinessContextService).selectedBusiness;

  @Input() pageTitle = 'Dashboard';
  @Input() userName = 'Amina Hosny';
  @Output() toggleMenu = new EventEmitter<void>();
  @Output() editProfile = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  dropdownOpen = false;

}
