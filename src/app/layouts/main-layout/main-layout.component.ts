import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute, NavigationEnd, RouterOutlet } from '@angular/router';
import { filter, map, mergeMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth-service/auth-service';
import { SidebarComponent } from '../../shared/ui/sidebar/sidebar.component';
import { HeaderComponent } from '../../shared/ui/header/header.component';
import { catchError, of } from 'rxjs';


function isMobile(): boolean {
  return window.matchMedia('(max-width: 1023px)').matches;
}
@Component({
  imports: [RouterOutlet, SidebarComponent, HeaderComponent],
  selector: 'app-main-layout',
  styleUrl: './main-layout.component.css',
  templateUrl: './main-layout.component.html',
})
export class MainLayoutComponent {

  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  readonly language = this.auth.language;

  constructor() {
    this.auth.getMyPermissions().pipe(catchError(() => of(null))).subscribe();
  }

  hasPermission(permission: string): boolean {
    return this.auth.hasPermission(permission);
  }

  private readonly _collapsed = signal(false);
  private readonly _mobileOpen = signal(false);

  sidebarCollapsed = this._collapsed.asReadonly();
  mobileOpen = this._mobileOpen.asReadonly();

  editProfileOpen = false;

  pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => {
        let route = this.activatedRoute;
        while (route.firstChild) route = route.firstChild;
        return route;
      }),
      mergeMap((route) => route.data),
      map((data) => (data['title'] as string) ?? 'Dashboard'),
    ),
    { initialValue: 'Dashboard' },
  );

  onHamburger(): void {
    if (isMobile()) {
      this._mobileOpen.update((v) => !v);
    } else {
      this._collapsed.update((v) => !v);
    }
  }

  toggleCollapse(): void {
    this._collapsed.update((v) => !v);
  }

  closeMobileMenu(): void {
    this._mobileOpen.set(false);
  }

  openEditProfile(): void {
    this.editProfileOpen = true;
  }

  onLogout(): void {
    this.auth.logout().subscribe({ complete: () => this.router.navigateByUrl('/login'), error: () => this.router.navigateByUrl('/login') });
  }
}
