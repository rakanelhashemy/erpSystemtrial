import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toast } from 'ngx-sonner';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth-service/auth-service';
import { BrandingService } from '../../core/services/branding.service';
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*\d).{6,}$/;
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  styleUrl: './login.component.css',
  templateUrl: './login.component.html',
})

export class LoginComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  protected readonly branding = inject(BrandingService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly loginForm = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.pattern(PASSWORD_PATTERN)]],
  });

  protected onSubmit(): void {
    if (this.loginForm.invalid || this.submitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    this.authService
      .signIn(this.loginForm.getRawValue())
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          toast.success('Login successful', { closeButton: true });
           this.router.navigate(['/app']);
        },
        error: (err) =>
          toast.error('Login failed', {
            description: err?.error?.message ?? 'Invalid email or password',
            closeButton: true,
          }),
      });
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }
}
