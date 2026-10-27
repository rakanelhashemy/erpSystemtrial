import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth-service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;
  if (!auth.getAccessToken()) return router.createUrlTree(['/login']);

  return auth.refreshToken().pipe(
    map(() => auth.isAuthenticated() || router.createUrlTree(['/login'])),
    catchError(() => of(router.createUrlTree(['/login']))),
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return router.createUrlTree(['/app/dashboard']);
  if (!auth.getAccessToken()) return true;

  return auth.refreshToken().pipe(
    map(() => auth.isAuthenticated() ? router.createUrlTree(['/app/dashboard']) : true),
    catchError(() => of(true)),
  );
};

export const permissionGuard: CanActivateChildFn = (route) => {
  const permission = route.data['requiredPermission'] as string | undefined;
  const additionalPermission = route.data['additionalPermission'] as string | undefined;
  const queryPermission =
    route.routeConfig?.path === 'users' && route.queryParamMap.get('add') === '1'
      ? 'Permissions.Users.Add'
      : undefined;
  const required = [permission, additionalPermission, queryPermission].filter(
    (value): value is string => !!value,
  );
  if (required.length === 0) return true;

  const auth = inject(AuthService);
  const router = inject(Router);
  const checkPermission = () =>
    required.every((item) => auth.hasPermission(item)) || router.createUrlTree(['/app/dashboard']);

  if (auth.permissionsLoaded()) return checkPermission();

  return auth.getMyPermissions().pipe(
    map(() => checkPermission()),
    catchError(() => of(router.createUrlTree(['/app/dashboard']))),
  );
};
