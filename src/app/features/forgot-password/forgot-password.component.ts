import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toast } from 'ngx-sonner';
import { finalize, Observable, take, timer } from 'rxjs';
import { ApiResponse, AuthService } from '../../core/auth/auth-service/auth-service';
import { BrandingService } from '../../core/services/branding.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly branding = inject(BrandingService);
  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly submitting = signal(false);
  protected readonly showNewPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resendCooldownSeconds = signal(0);
  protected readonly email = signal('');

  protected readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
  });

  private readonly passwordsMatch = (control: AbstractControl): ValidationErrors | null => {
    const { newPassword, confirmPassword } = control.value as {
      newPassword?: string;
      confirmPassword?: string;
    };
    return !confirmPassword || newPassword === confirmPassword ? null : { mismatch: true };
  };

  protected readonly passwordForm = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: this.passwordsMatch },
  );

  protected requestCode(): void {
    if (this.submitting() || this.resendCooldownSeconds() > 0) return;
    const emailControl = this.emailForm.controls.email;
    emailControl.setValue(emailControl.value.trim());
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    const email = this.emailForm.getRawValue().email.trim();
    this.submit(
      () => this.auth.forgotPassword({ email }),
      (response) => {
        this.email.set(email);
        this.codeForm.reset();
        this.passwordForm.reset();
        const message = this.getSuccessMessage(response);
        toast.success(message, { closeButton: true });
        this.startResendCooldown();
        this.step.set(2);
      },
    );
  }

  protected verifyCode(): void {
    if (this.submitting()) return;
    const codeControl = this.codeForm.controls.code;
    codeControl.setValue(codeControl.value.trim());
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }
    const code = this.codeForm.getRawValue().code.trim();
    this.submit(
      () => this.auth.verifyResetCode({ email: this.email(), code }),
      () => this.step.set(3),
    );
  }

  protected resendCode(): void {
    if (this.submitting() || this.resendCooldownSeconds() > 0 || !this.email()) return;
    this.startResendCooldown();
    this.submit(
      () => this.auth.forgotPassword({ email: this.email() }),
      (response) => {
        const message = this.getSuccessMessage(response);
        toast.success(message, { closeButton: true });
      },
    );
  }

  private startResendCooldown(): void {
    const cooldownSeconds = 60;
    this.resendCooldownSeconds.set(cooldownSeconds);
    timer(0, 1_000)
      .pipe(take(cooldownSeconds + 1), takeUntilDestroyed(this.destroyRef))
      .subscribe((elapsedSeconds) => {
        this.resendCooldownSeconds.set(cooldownSeconds - elapsedSeconds);
      });
  }

  protected resetPassword(): void {
    if (this.submitting()) return;
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { newPassword, confirmPassword } = this.passwordForm.getRawValue();
    const code = this.codeForm.getRawValue().code.trim();
    this.submit(
      () =>
        this.auth.resetPassword({
          email: this.email(),
          code,
          newPassword,
          confirmPassword,
        }),
      () => this.router.navigateByUrl('/login'),
    );
  }

  protected togglePasswordVisibility(field: 'new' | 'confirm'): void {
    if (field === 'new') this.showNewPassword.update((visible) => !visible);
    else this.showConfirmPassword.update((visible) => !visible);
  }

  protected back(): void {
    if (this.submitting()) return;
    this.error.set(null);
    this.step.update((current) => (current === 3 ? 2 : 1));
  }

  private submit(
    request: () => Observable<ApiResponse<unknown>>,
    onSuccess: (response: ApiResponse<unknown>) => void,
  ): void {
    this.error.set(null);
    this.submitting.set(true);
    request()
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (response) => {
          if (response?.succeeded !== true) {
            this.error.set(
              response?.message ||
                response?.errors?.join(' ') ||
                'The request could not be completed.',
            );
            return;
          }
          onSuccess(response);
        },
        error: (err: unknown) => this.error.set(this.getErrorMessage(err)),
      });
  }

  private getSuccessMessage(response: ApiResponse<unknown>): string {
    if (typeof response.data === 'string' && response.data.trim()) return response.data;
    return response.message?.trim() || 'The reset code request was accepted.';
  }

  private getErrorMessage(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('error' in error)) {
      return 'Something went wrong. Please try again.';
    }
    const body = error.error;
    if (typeof body !== 'object' || body === null) {
      return 'Something went wrong. Please try again.';
    }
    if ('message' in body && typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if ('errors' in body && Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors
        .filter((message): message is string => typeof message === 'string')
        .join(' ');
    }
    return 'Something went wrong. Please try again.';
  }
}
