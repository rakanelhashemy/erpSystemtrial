import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd, RouterOutlet } from '@angular/router';
import { filter, map, mergeMap, catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth-service/auth-service';
import { SidebarComponent } from '../../shared/ui/sidebar/sidebar.component';
import { HeaderComponent } from '../../shared/ui/header/header.component';
import { Userservices } from '../../core/services/userservices';

function isMobile(): boolean {
  return window.matchMedia('(max-width: 1023px)').matches;
}

@Component({
  imports: [RouterOutlet, ReactiveFormsModule, SidebarComponent, HeaderComponent],
  selector: 'app-main-layout',
  styleUrl: './main-layout.component.css',
  templateUrl: './main-layout.component.html',
})
export class MainLayoutComponent {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly users = inject(Userservices);
  readonly language = this.auth.language;

  constructor() {
    this.auth
      .getMyPermissions()
      .pipe(catchError(() => of(null)))
      .subscribe();
    // تحميل بيانات المستخدم الحالي (للهيدر وللمودال)
    this.users
      .loadMe()
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  hasPermission(permission: string): boolean {
    return this.auth.hasPermission(permission);
  }

  private readonly _collapsed = signal(false);
  private readonly _mobileOpen = signal(false);
  sidebarCollapsed = this._collapsed.asReadonly();
  mobileOpen = this._mobileOpen.asReadonly();

  // ---------- Edit Profile ----------
  readonly editProfileOpen = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly changingPassword = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly passwordSuccess = signal(false);
  readonly showCurrentPassword = signal(false);
  readonly showNewPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly terminating = signal(false);
  readonly terminateError = signal<string | null>(null);
  readonly terminateSuccess = signal(false);
  readonly confirmTerminate = signal(false);

  readonly profileForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.maxLength(50)]],
    email: [{ value: '', disabled: true }],
    phone: ['', [Validators.pattern(/^\+?[0-9\s]{7,20}$/)]],
  });

  private readonly passwordsMatch = (control: AbstractControl): ValidationErrors | null => {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return !confirmPassword || newPassword === confirmPassword ? null : { mismatch: true };
  };

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: this.passwordsMatch },
  );

  openEditProfile(): void {
    const u = this.users.currentUser();
    const [first = '', ...rest] = (u?.fullName ?? '').trim().split(/\s+/);

    this.profileForm.reset({
      firstName: first,
      lastName: rest.join(' '),
      email: u?.email ?? '',
      phone: u?.phone ?? '',
    });
    this.saveError.set(null);
    this.passwordError.set(null);
    this.passwordSuccess.set(false);
    this.terminateError.set(null);
    this.terminateSuccess.set(false);
    this.confirmTerminate.set(false);
    this.passwordForm.reset();
    this.showCurrentPassword.set(false);
    this.showNewPassword.set(false);
    this.showConfirmPassword.set(false);
    this.editProfileOpen.set(true);
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword.update((visible) => !visible);
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.update((visible) => !visible);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update((visible) => !visible);
  }

  closeEditProfile(): void {
    if (this.saving()) return;
    this.editProfileOpen.set(false);
  }

  saveProfile(): void {
    const phoneControl = this.profileForm.controls.phone;
    phoneControl.setValue(phoneControl.value.trim());
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const { firstName, lastName, phone } = this.profileForm.getRawValue();
    const trimmedPhone = phone.trim();

    this.saving.set(true);
    this.saveError.set(null);

    this.users
      .updateProfile({
        fullName: `${firstName} ${lastName}`.trim(),
        phone: trimmedPhone || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editProfileOpen.set(false);
        },
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(err?.error?.message ?? 'Could not save changes. Please try again.');
        },
      });
  }

  savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();
    const userId = this.users.currentUser()?.id;
    if (!userId) {
      this.passwordError.set('Could not identify the current user. Please reload and try again.');
      return;
    }

    this.changingPassword.set(true);
    this.passwordError.set(null);
    this.passwordSuccess.set(false);
    this.auth
      .changePassword({
        userId,
        currentPassword,
        newPassword,
        confirmNewPassword: confirmPassword,
      })
      .subscribe({
        next: () => {
          this.changingPassword.set(false);
          this.passwordForm.reset();
          this.passwordSuccess.set(true);
        },
        error: (err) => {
          this.changingPassword.set(false);
          this.passwordError.set(
            err?.error?.message ?? 'Could not update password. Please try again.',
          );
        },
      });
  }

  terminateSessions(): void {
    const userId = this.users.currentUser()?.id;
    if (!userId) {
      this.terminateError.set('Could not identify the current user. Please reload and try again.');
      return;
    }

    this.terminating.set(true);
    this.terminateError.set(null);
    this.terminateSuccess.set(false);
    this.auth.revokeAllSessions(userId).subscribe({
      next: () => {
        this.terminating.set(false);
        this.confirmTerminate.set(false);
        this.terminateSuccess.set(true);
      },
      error: (err) => {
        this.terminating.set(false);
        this.terminateError.set(
          err?.error?.message ?? 'Could not terminate sessions. Please try again.',
        );
      },
    });
  }
  // ----------------------------------

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
    if (isMobile()) this._mobileOpen.update((v) => !v);
    else this._collapsed.update((v) => !v);
  }

  toggleCollapse(): void {
    this._collapsed.update((v) => !v);
  }

  closeMobileMenu(): void {
    this._mobileOpen.set(false);
  }

  onLogout(): void {
    this.users.clear();
    this.auth.logout().subscribe({
      complete: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
