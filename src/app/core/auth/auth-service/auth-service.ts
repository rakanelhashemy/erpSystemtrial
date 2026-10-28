import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface SignInRequest {
  email: string;
  password: string;
}

export interface AuthResponseData {
  accessToken?: string;
  token?: string;
  jwtToken?: string;
  userName?: string;
  email?: string;
}

export interface ApiResponse<T> {
  succeeded: boolean;
  message?: string;
  data: T;
}

export interface PermissionsResponse extends ApiResponse<string[]> {
  statusCode?: number;
  meta?: unknown;
  errors?: string[];
}

export type AppLanguage = 'en' | 'ar';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly httpClient = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenKey = 'Token';
  private readonly languageKey = 'AppLanguage';
  private readonly currentLanguage = signal<AppLanguage>(this.readSavedLanguage());
  readonly language = this.currentLanguage.asReadonly();
  private readonly permissionSet = signal<ReadonlySet<string>>(new Set());
  readonly permissions = this.permissionSet.asReadonly();
  readonly permissionsLoaded = signal(false);
  private refreshRequest$?: Observable<ApiResponse<AuthResponseData>>;
  private permissionsRequest$?: Observable<PermissionsResponse>;

  signIn(data: SignInRequest): Observable<ApiResponse<AuthResponseData>> {
    return this.httpClient
      .post<ApiResponse<AuthResponseData>>(`${environment.baseUrl}Auth/SignIn`, data, {
        headers: { 'X-Client-Type': 'web' },
      })
      .pipe(
        tap((res) => this.saveAuthData(res?.data)),
        catchError(this.handleAuthError),
      );
  }

  getMyPermissions(forceRefresh = false): Observable<PermissionsResponse> {
    if (this.permissionsLoaded() && !forceRefresh) {
      return of({ succeeded: true, data: [...this.permissionSet()] });
    }
    if (this.permissionsRequest$) return this.permissionsRequest$;

    const request$ = this.httpClient
      .get<PermissionsResponse>(`${environment.baseUrl}Auth/MyPermissions`)
      .pipe(
        tap((response) => {
          this.permissionSet.set(new Set(response?.data ?? []));
          this.permissionsLoaded.set(true);
        }),
        finalize(() => (this.permissionsRequest$ = undefined)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.permissionsRequest$ = request$;
    return request$;
  }

  hasPermission(permission: string): boolean {
    return this.permissionSet().has(permission);
  }

  setLanguage(language: AppLanguage): void {
    this.currentLanguage.set(language);
    localStorage.setItem(this.languageKey, language);
  }

  private readSavedLanguage(): AppLanguage {
    const saved = localStorage.getItem(this.languageKey);
    if (saved === 'en' || saved === 'ar') return saved;
    return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ar')
      ? 'ar'
      : 'en';
  }

  logout(): Observable<unknown> {
    return this.httpClient
      .post(
        `${environment.baseUrl}Auth/Logout`,
        {
          accessToken: this.getAccessToken() ?? '',
        },
        {
          headers: { 'X-Client-Type': 'web' },
        },
      )
      .pipe(finalize(() => this.clearAuthData()));
  }

  refreshToken(): Observable<ApiResponse<AuthResponseData>> {
    if (this.refreshRequest$) return this.refreshRequest$;

    const request$ = this.httpClient
      .post<ApiResponse<AuthResponseData>>(
        `${environment.baseUrl}Auth/RefreshToken`,
        {
          accessToken: this.getAccessToken() ?? '',
        },
        {
          headers: { 'X-Client-Type': 'web' },
        },
      )
      .pipe(
        tap((res) => this.saveAuthData(res?.data)),
        catchError((err) => {
          this.clearAuthDataAndRedirect();
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshRequest$ = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    this.refreshRequest$ = request$;
    return request$;
  }

  revokeToken(): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/RevokeToken`, {})
      .pipe(catchError(this.handleAuthError));
  }

  revokeAllSessions(): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/RevokeAllSessions`, {})
      .pipe(catchError(this.handleAuthError));
  }

  forgotPassword(data: { email: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/ForgotPassword`, data)
      .pipe(catchError(this.handleAuthError));
  }

  verifyResetCode(data: { email: string; code: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/VerifyResetCode`, data)
      .pipe(catchError(this.handleAuthError));
  }

  resetPassword(data: { email: string; code: string; newPassword: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/ResetPassword`, data)
      .pipe(catchError(this.handleAuthError));
  }

  changePassword(data: { oldPassword: string; newPassword: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/ChangePassword`, data)
      .pipe(catchError(this.handleAuthError));
  }

  verifyCode(data: { email: string; code: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/VerifyCode`, data)
      .pipe(catchError(this.handleAuthError));
  }

  resendCode(data: { email: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/ResendCode`, data)
      .pipe(catchError(this.handleAuthError));
  }

  invite(data: { email: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/Invite`, data)
      .pipe(catchError(this.handleAuthError));
  }

  verifyInvite(data: { token: string }): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/verify-invite`, data)
      .pipe(catchError(this.handleAuthError));
  }

  completeRegistration(data: object): Observable<unknown> {
    return this.httpClient
      .post(`${environment.baseUrl}Auth/CompleteRegistration`, data)
      .pipe(catchError(this.handleAuthError));
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAccessTokenExpired(): boolean {
    if (!this.getAccessToken()) return true;
    const payload = this.getTokenPayload();
    if (!payload) return true;
    const exp = payload['exp'];
    return typeof exp === 'number' ? Date.now() >= exp * 1000 - 10_000 : false;
  }

  getTokenPayload(): Record<string, unknown> | null {
    const token = this.getAccessToken();
    if (!token) return null;
    try {
      const encoded = token.split('.')[1];
      if (!encoded) return null;
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(
        atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
      );
      return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }


  isAuthenticated(): boolean {
    return !!this.getAccessToken() && !this.isAccessTokenExpired();
  }

  saveAuthData(data: AuthResponseData | undefined | null): void {
    if (!data) return;
    const accessToken = data.accessToken ?? data.token ?? data.jwtToken;
    if (accessToken) localStorage.setItem(this.tokenKey, accessToken);
  }

  clearAuthData(): void {
    localStorage.removeItem(this.tokenKey);
    this.permissionSet.set(new Set());
    this.permissionsLoaded.set(false);
  }

  clearAuthDataAndRedirect(): void {
    this.clearAuthData();
    this.router.navigate(['/login']);
  }

  private handleAuthError = (error: unknown) => {
    return throwError(() => error);
  };
}
