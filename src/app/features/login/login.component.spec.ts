import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { toast } from 'ngx-sonner';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth-service/auth-service';
import { BrandingService } from '../../core/services/branding.service';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class RouteStubComponent {}

describe('LoginComponent', () => {
  const auth = { signIn: vi.fn() };
  let fixture: ComponentFixture<LoginComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([{ path: 'app', component: RouteStubComponent }]),
        { provide: AuthService, useValue: auth },
        BrandingService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('does not submit invalid credentials', () => {
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(auth.signIn).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Email is required.');
  });

  it('submits valid credentials with the remember-me choice', () => {
    auth.signIn.mockReturnValue(of({ succeeded: true, data: { accessToken: 'token' } }));
    element.querySelector<HTMLInputElement>('#login-email')!.value = 'user@example.com';
    element.querySelector<HTMLInputElement>('#login-email')!.dispatchEvent(new Event('input'));
    element.querySelector<HTMLInputElement>('#login-password')!.value = 'secret1';
    element.querySelector<HTMLInputElement>('#login-password')!.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

    expect(auth.signIn).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'secret1' },
      true,
    );
  });

  it('shows an error when authentication fails', () => {
    const errorToast = vi.spyOn(toast, 'error');
    auth.signIn.mockReturnValue(throwError(() => ({ error: { message: 'Account locked' } })));
    element.querySelector<HTMLInputElement>('#login-email')!.value = 'user@example.com';
    element.querySelector<HTMLInputElement>('#login-email')!.dispatchEvent(new Event('input'));
    element.querySelector<HTMLInputElement>('#login-password')!.value = 'secret1';
    element.querySelector<HTMLInputElement>('#login-password')!.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

    expect(errorToast).toHaveBeenCalledWith(
      'Login failed',
      expect.objectContaining({ description: 'Account locked' }),
    );
  });
});
