import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth-service/auth-service';
import { BrandingService } from '../../core/services/branding.service';
import { ForgotPasswordComponent } from './forgot-password.component';

@Component({ template: '' })
class RouteStubComponent {}

describe('ForgotPasswordComponent', () => {
  const response = {
    succeeded: true,
    statusCode: 200,
    message: 'Success',
    errors: [],
    data: 'Verification code sent successfully',
  };
  const auth = {
    forgotPassword: vi.fn(() => of(response)),
    verifyResetCode: vi.fn(() => of({ succeeded: true, data: null })),
    resetPassword: vi.fn(() => of({ succeeded: true, data: null })),
  };
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    auth.forgotPassword.mockReturnValue(of(response));
    auth.verifyResetCode.mockReturnValue(of({ succeeded: true, data: null }));
    auth.resetPassword.mockReturnValue(of({ succeeded: true, data: null }));

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([{ path: 'login', component: RouteStubComponent }]),
        { provide: AuthService, useValue: auth },
        BrandingService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('validates an email before requesting a reset code', () => {
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(auth.forgotPassword).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter a valid email address.');
  });

  it('sends the initial email request and advances to code verification on success', () => {
    const emailInput = element.querySelector<HTMLInputElement>('#reset-email')!;
    emailInput.value = '  user@example.com  ';
    emailInput.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(auth.forgotPassword).toHaveBeenCalledWith({ email: 'user@example.com' });
    expect(element.textContent).toContain('Verify reset code');
    expect(element.textContent).toContain('Resend code in 60s');
  });

  it('requests a new code through forgot-password after the cooldown', () => {
    const emailInput = element.querySelector<HTMLInputElement>('#reset-email')!;
    emailInput.value = 'user@example.com';
    emailInput.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();

    const resendButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Resend code'),
    )!;
    expect(resendButton.disabled).toBe(false);
    resendButton.click();
    fixture.detectChanges();

    expect(auth.forgotPassword).toHaveBeenCalledTimes(2);
    expect(auth.forgotPassword).toHaveBeenLastCalledWith({ email: 'user@example.com' });
    expect(resendButton.disabled).toBe(true);
  });

  it('submits code, new password, and confirmation in sequence', () => {
    const emailInput = element.querySelector<HTMLInputElement>('#reset-email')!;
    emailInput.value = 'user@example.com';
    emailInput.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const codeInput = element.querySelector<HTMLInputElement>('#reset-code')!;
    codeInput.value = '012345';
    codeInput.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(auth.verifyResetCode).toHaveBeenCalledWith({
      email: 'user@example.com',
      code: '012345',
    });

    const newPasswordInput = element.querySelector<HTMLInputElement>('#new-password')!;
    expect(newPasswordInput.type).toBe('password');
    element.querySelector<HTMLButtonElement>('[aria-label="Show new password"]')!.click();
    fixture.detectChanges();
    expect(newPasswordInput.type).toBe('text');
    newPasswordInput.value = 'NewPassword1';
    newPasswordInput.dispatchEvent(new Event('input'));
    element.querySelector<HTMLInputElement>('#confirm-password')!.value = 'NewPassword1';
    element.querySelector<HTMLInputElement>('#confirm-password')!.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(auth.resetPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      code: '012345',
      newPassword: 'NewPassword1',
      confirmPassword: 'NewPassword1',
    });
  });
});
