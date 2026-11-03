import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { BrandingService } from '../../../core/services/branding.service';
import { BusinessContextService } from '../../../core/services/business-context.service';
import { Userservices } from '../../../core/services/userservices';

@Component({
  imports: [],
  selector: 'app-header',
  styleUrl: './header.component.css',
  templateUrl: './header.component.html',
})
export class HeaderComponent {
 readonly branding = inject(BrandingService);
  readonly selectedBusiness = inject(BusinessContextService).selectedBusiness;
  private readonly userServices = inject(Userservices);


  readonly user = this.userServices.currentUser;
  readonly initial = this.userServices.initial;
  readonly role = this.userServices.primaryRole;

  @Input() pageTitle = 'Dashboard';
  @Output() toggleMenu = new EventEmitter<void>();
  @Output() editProfile = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  dropdownOpen = false;

  ngOnInit(): void {
   
    if (!this.user()) {
      this.userServices.loadMe().subscribe({
        error: (err) => console.error('Failed to load current user', err),
      });
    }
  }

  onEditProfile(): void {
    this.editProfile.emit();
    this.dropdownOpen = false;
  }

  onLogout(): void {
    this.dropdownOpen = false;
    this.userServices.clear();
    this.logout.emit();
  }
}
