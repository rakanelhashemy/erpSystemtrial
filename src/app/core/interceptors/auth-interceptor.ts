import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth-service/auth-service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const trustedBase = new URL(environment.baseUrl);
  let isTrustedApi = false;
  try {
    const requestUrl = new URL(req.url, trustedBase);
    isTrustedApi = requestUrl.origin === trustedBase.origin &&
      requestUrl.pathname.startsWith(trustedBase.pathname);
  } catch {
    isTrustedApi = false;
  }
  const accessToken = isTrustedApi ? auth.getAccessToken() : null;

  const clonedReq = req.clone({
    withCredentials: isTrustedApi,
    setHeaders: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Accept-Language': auth.language(),
    },
  });

  return next(clonedReq).pipe(
    catchError((error: unknown) => {
      const isRefreshRequest = req.url.toLowerCase().includes('/auth/refreshtoken');
      const isSignInRequest = req.url.toLowerCase().includes('/auth/signin');
      const isMyPermissionsRequest = req.url.toLowerCase().includes('/auth/mypermissions');

      if (
        error instanceof HttpErrorResponse &&
        error.status === 403 &&
        isTrustedApi &&
        accessToken &&
        !isMyPermissionsRequest
      ) {
        return auth.getMyPermissions(true).pipe(
          switchMap(() => next(clonedReq)),
          catchError(() => throwError(() => error)),
        );
      }

      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        !accessToken ||
        isRefreshRequest ||
        isSignInRequest
      ) {
        return throwError(() => error);
      }

      return auth.refreshToken().pipe(
        switchMap(() => {
          const refreshedToken = auth.getAccessToken();
          if (!refreshedToken) return throwError(() => error);

          return next(clonedReq.clone({
            setHeaders: { Authorization: `Bearer ${refreshedToken}` },
          }));
        })
      );
    })
  );
};
