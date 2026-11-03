import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toast } from 'ngx-sonner';
import { finalize } from 'rxjs';
import { ApiResponse, AuthService } from '../../core/auth/auth-service/auth-service';
import { BrandingService } from '../../core/services/branding.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly branding = inject(BrandingService);

  protected readonly email = signal('');
  protected readonly invitationToken = signal('');
  protected readonly verifying = signal(true);
  protected readonly submitting = signal(false);
  protected readonly invitationValid = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly showConfirmPassword = signal(false);

  private readonly passwordsMatch = (control: AbstractControl): ValidationErrors | null => {
    const { password, confirmPassword } = control.value as {
      password?: string;
      confirmPassword?: string;
    };
    return !confirmPassword || password === confirmPassword ? null : { mismatch: true };
  };

  protected readonly registrationForm = this.fb.nonNullable.group(
    {
      phone: ['', [Validators.pattern(/^[+\d][\d\s()-]{5,24}$/)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: this.passwordsMatch },
  );

  constructor() {
    const email = this.route.snapshot.queryParamMap.get('email')?.trim() ?? '';
    const invitationToken = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.email.set(email);
    this.invitationToken.set(invitationToken);

    if (!email || !invitationToken) {
      this.verifying.set(false);
      this.error.set('This invitation link is missing required information.');
      return;
    }

    this.auth
      .verifyInvite({ email, invitationToken })
      .pipe(
        finalize(() => this.verifying.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (response?.succeeded === false) {
            this.error.set(
              response.message ||
                response.errors?.join(' ') ||
                'This invitation is invalid or expired.',
            );
            return;
          }
          this.invitationValid.set(true);
        },
        error: (error: unknown) => this.error.set(this.getErrorMessage(error)),
      });
  }

  protected submit(): void {
    if (this.submitting() || !this.invitationValid()) return;
    if (this.registrationForm.invalid) {
      this.registrationForm.markAllAsTouched();
      return;
    }

    const { phone, password, confirmPassword } = this.registrationForm.getRawValue();
    this.error.set(null);
    this.submitting.set(true);
    this.auth
      .completeRegistration({
        email: this.email(),
        invitationToken: this.invitationToken(),
        phone: phone.trim() || null,
        password,
        confirmPassword,
      })
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          if (response?.succeeded === false) {
            this.error.set(
              response.message || response.errors?.join(' ') || 'Could not complete registration.',
            );
            return;
          }
          toast.success('Your account is ready. You can sign in now.', { closeButton: true });
          void this.router.navigateByUrl('/login');
        },
        error: (error: unknown) => this.error.set(this.getErrorMessage(error)),
      });
  }

  protected togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') this.showPassword.update((visible) => !visible);
    else this.showConfirmPassword.update((visible) => !visible);
  }

  private getErrorMessage(error: unknown): string {
    const message = (error as { error?: { message?: string; errors?: string[] }; message?: string })
      ?.error;
    return message?.message || message?.errors?.join(' ') || 'Could not verify this invitation.';
  }
}
