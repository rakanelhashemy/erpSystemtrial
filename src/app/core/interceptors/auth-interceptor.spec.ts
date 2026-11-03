import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth-service/auth-service';
import { authInterceptor } from './auth-interceptor';

describe('authInterceptor', () => {
  const auth = {
    getAccessToken: vi.fn(),
    language: vi.fn(),
    refreshToken: vi.fn(),
    getMyPermissions: vi.fn(),
  };
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getAccessToken.mockReturnValue(null);
    auth.language.mockReturnValue('en');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adds auth, language, and credentials only for the configured API origin', () => {
    auth.getAccessToken.mockReturnValue('access-token');
    auth.language.mockReturnValue('ar');
    client.get(`${environment.baseUrl}User/Me`).subscribe();
    const trustedRequest = http.expectOne(`${environment.baseUrl}User/Me`);

    expect(trustedRequest.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(trustedRequest.request.headers.get('Accept-Language')).toBe('ar');
    expect(trustedRequest.request.withCredentials).toBe(true);
    trustedRequest.flush({ succeeded: true });

    client.get('https://other.example/api').subscribe();
    const externalRequest = http.expectOne('https://other.example/api');
    expect(externalRequest.request.headers.has('Authorization')).toBe(false);
    expect(externalRequest.request.headers.has('Accept-Language')).toBe(false);
    expect(externalRequest.request.withCredentials).toBe(false);
    externalRequest.flush({ ok: true });
  });

  it('refreshes a token once after an authorized API request returns 401', () => {
    auth.getAccessToken.mockReturnValueOnce('old-token').mockReturnValue('new-token');
    auth.refreshToken.mockReturnValue(of({ succeeded: true }));
    let response: unknown;
    client.get(`${environment.baseUrl}User/Me`).subscribe((result) => (response = result));

    const firstRequest = http.expectOne(`${environment.baseUrl}User/Me`);
    expect(firstRequest.request.headers.get('Authorization')).toBe('Bearer old-token');
    firstRequest.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    const retry = http.expectOne(`${environment.baseUrl}User/Me`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ succeeded: true, data: { id: 'user-1' } });

    expect(response).toEqual({ succeeded: true, data: { id: 'user-1' } });
    expect(auth.refreshToken).toHaveBeenCalledOnce();
  });

  it('does not refresh on sign-in failures', () => {
    auth.getAccessToken.mockReturnValue('access-token');
    let caught: unknown;
    client
      .post(`${environment.baseUrl}Auth/SignIn`, {})
      .subscribe({ error: (error) => (caught = error) });
    http.expectOne(`${environment.baseUrl}Auth/SignIn`).flush('Unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
    });

    expect(caught).toBeInstanceOf(HttpErrorResponse);
    expect(auth.refreshToken).not.toHaveBeenCalled();
  });
});
