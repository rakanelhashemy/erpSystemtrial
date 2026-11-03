import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';
import { authGuard, guestGuard, permissionGuard } from './auth.guard';

describe('authentication guards', () => {
  const redirect = { redirect: true };
  const router = { createUrlTree: vi.fn(() => redirect) };
  const auth = {
    isAuthenticated: vi.fn(),
    getAccessToken: vi.fn(),
    refreshToken: vi.fn(),
    permissionsLoaded: vi.fn(),
    hasPermission: vi.fn(),
    getMyPermissions: vi.fn(),
  };

  const resolveGuardResult = (result: ReturnType<typeof authGuard>): Promise<unknown> =>
    isObservable(result) ? firstValueFrom(result) : Promise.resolve(result);

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('allows authenticated users through the auth guard', () => {
    auth.isAuthenticated.mockReturnValue(true);

    expect(
      TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ),
    ).toBe(true);
    expect(auth.refreshToken).not.toHaveBeenCalled();
  });

  it('redirects users without a token to login', () => {
    auth.isAuthenticated.mockReturnValue(false);
    auth.getAccessToken.mockReturnValue(null);

    expect(
      TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ),
    ).toBe(redirect);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('refreshes an expired token before allowing the user through', async () => {
    auth.isAuthenticated.mockReturnValueOnce(false).mockReturnValueOnce(true);
    auth.getAccessToken.mockReturnValue('expired-token');
    auth.refreshToken.mockReturnValue(of({ succeeded: true }));

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    await expect(resolveGuardResult(result)).resolves.toBe(true);
  });

  it('allows guests without an access token to reach public routes', () => {
    auth.isAuthenticated.mockReturnValue(false);
    auth.getAccessToken.mockReturnValue(null);

    expect(
      TestBed.runInInjectionContext(() =>
        guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ),
    ).toBe(true);
  });

  it('requires every configured permission and redirects when one is missing', () => {
    auth.permissionsLoaded.mockReturnValue(true);
    auth.hasPermission.mockImplementation((permission: string) => permission === 'Can.View');
    const route = {
      data: { requiredPermission: 'Can.View', additionalPermission: 'Can.Edit' },
      routeConfig: { path: 'items' },
      queryParamMap: { get: () => null },
    } as unknown as ActivatedRouteSnapshot;

    expect(
      TestBed.runInInjectionContext(() => permissionGuard(route, {} as RouterStateSnapshot)),
    ).toBe(redirect);
    expect(auth.hasPermission).toHaveBeenCalledWith('Can.View');
    expect(auth.hasPermission).toHaveBeenCalledWith('Can.Edit');
  });

  it('loads permissions before checking protected routes', async () => {
    auth.permissionsLoaded.mockReturnValue(false);
    auth.getMyPermissions.mockReturnValue(of({ succeeded: true, data: [] }));
    auth.hasPermission.mockReturnValue(true);
    const route = {
      data: { requiredPermission: 'Can.View' },
      routeConfig: { path: 'items' },
      queryParamMap: { get: () => null },
    } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() =>
      permissionGuard(route, {} as RouterStateSnapshot),
    );
    await expect(resolveGuardResult(result)).resolves.toBe(true);
  });

  it('keeps guest access available when refresh fails', async () => {
    auth.isAuthenticated.mockReturnValue(false);
    auth.getAccessToken.mockReturnValue('expired-token');
    auth.refreshToken.mockReturnValue(throwError(() => new Error('refresh failed')));

    const result = TestBed.runInInjectionContext(() =>
      guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    await expect(resolveGuardResult(result)).resolves.toBe(true);
  });
});
