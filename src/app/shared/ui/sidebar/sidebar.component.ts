import { Component, EventEmitter, Input, Output, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { BrandingService } from '../../../core/services/branding.service';
import { AuthService } from '../../../core/auth/auth-service/auth-service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  styleUrl: './sidebar.component.css',
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent implements OnInit {
  @Input({ required: true }) collapsed!: () => boolean;
  @Input({ required: true }) mobileOpen!: () => boolean;
  @Output() closeMobile = new EventEmitter<void>();
  @Output() collapseToggled = new EventEmitter<void>();

  private router = inject(Router);
  readonly branding = inject(BrandingService);
  readonly auth = inject(AuthService);

  openMenus: Record<string, boolean> = {};

  ngOnInit(): void {
    const url = this.router.url;
    if (url.startsWith('/app/locations') || url.startsWith('/app/location-types'))
      this.openMenus['locations'] = true;
    if (
      url.startsWith('/app/items') ||
      url.startsWith('/app/bulk-import') ||
      url.startsWith('/app/depreciation-reports')
    )
      this.openMenus['items'] = true;
    if (url.startsWith('/app/check-item') || url.startsWith('/app/check-lists'))
      this.openMenus['checklist'] = true;
    if (url.startsWith('/app/users') || url.startsWith('/app/roles'))
      this.openMenus['users'] = true;
  }

  toggleMenu(key: string): void {
    this.openMenus[key] = !this.openMenus[key];
  }

  onNavigate(): void {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      this.closeMobile.emit();
    }
  }
}
