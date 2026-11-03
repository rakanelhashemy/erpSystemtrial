import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AuthService } from './auth-service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('posts sign in credentials and stores the token persistently by default', () => {
    let succeeded = false;
    service.signIn({ email: 'user@example.com', password: 'secret1' }).subscribe(() => {
      succeeded = true;
    });

    const request = http.expectOne(`${environment.baseUrl}Auth/SignIn`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'user@example.com', password: 'secret1' });
    expect(request.request.headers.get('X-Client-Type')).toBe('web');
    request.flush({ succeeded: true, data: { accessToken: 'access-token' } });

    expect(succeeded).toBe(true);
    expect(localStorage.getItem('Token')).toBe('access-token');
    expect(sessionStorage.getItem('Token')).toBeNull();
  });

  it('stores the sign in token in session storage when remember me is false', () => {
    service.signIn({ email: 'user@example.com', password: 'secret1' }, false).subscribe();
    http.expectOne(`${environment.baseUrl}Auth/SignIn`).flush({
      succeeded: true,
      data: { jwtToken: 'session-token' },
    });

    expect(sessionStorage.getItem('Token')).toBe('session-token');
    expect(localStorage.getItem('Token')).toBeNull();
  });

  it('shares permission requests and caches the returned permissions', () => {
    const first = service.getMyPermissions().subscribe();
    const second = service.getMyPermissions().subscribe();
    const request = http.expectOne(`${environment.baseUrl}Auth/MyPermissions`);
    request.flush({ succeeded: true, data: ['Permissions.Users.View'] });

    expect(service.hasPermission('Permissions.Users.View')).toBe(true);
    expect(service.permissionsLoaded()).toBe(true);
    service.getMyPermissions().subscribe((result) => {
      expect(result.data).toEqual(['Permissions.Users.View']);
    });
    http.expectNone(`${environment.baseUrl}Auth/MyPermissions`);
    first.unsubscribe();
    second.unsubscribe();
  });

  it('sends reset-password requests with the declared payloads', () => {
    const email = 'user@example.com';
    service.forgotPassword({ email }).subscribe();
    http.expectOne(`${environment.baseUrl}Auth/ForgotPassword`).flush({
      succeeded: true,
      message: 'Success',
      data: 'Verification code sent successfully',
    });

    service.verifyResetCode({ email, code: '012345' }).subscribe();
    const verifyRequest = http.expectOne(`${environment.baseUrl}Auth/VerifyResetCode`);
    expect(verifyRequest.request.body).toEqual({ email, code: '012345' });
    verifyRequest.flush({ succeeded: true, data: null });

    service
      .resetPassword({
        email,
        code: '012345',
        newPassword: 'NewPassword1',
        confirmPassword: 'NewPassword1',
      })
      .subscribe();
    const resetRequest = http.expectOne(`${environment.baseUrl}Auth/ResetPassword`);
    expect(resetRequest.request.body).toEqual({
      email,
      code: '012345',
      newPassword: 'NewPassword1',
      confirmPassword: 'NewPassword1',
    });
    resetRequest.flush({ succeeded: true, data: null });
  });

  it('clears local authentication state after logout completes', () => {
    localStorage.setItem('Token', 'access-token');
    service.logout().subscribe();
    const request = http.expectOne(`${environment.baseUrl}Auth/Logout`);
    expect(request.request.body).toEqual({ accessToken: 'access-token' });
    request.flush({ succeeded: true });

    expect(localStorage.getItem('Token')).toBeNull();
    expect(service.permissionsLoaded()).toBe(false);
  });

  it('sends a user id when revoking all sessions', () => {
    service.revokeAllSessions('user-123').subscribe();
    const request = http.expectOne(`${environment.baseUrl}Auth/RevokeAllSessions`);

    expect(request.request.body).toEqual({ userId: 'user-123' });
    request.flush({ succeeded: true });
  });

  it('sends the invitation details to the reinvite endpoint', () => {
    const payload = {
      email: 'ada@example.com',
      frontendRegisterUrl: 'http://localhost:4200/register',
    };

    service.reinvite(payload).subscribe();
    const request = http.expectOne(`${environment.baseUrl}Auth/Reinvite`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ succeeded: true });
  });
});
