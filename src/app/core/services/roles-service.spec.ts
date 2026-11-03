import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { RolesService } from './roles-service';

describe('RolesService', () => {
  let service: RolesService;
  let http: HttpTestingController;
  const baseUrl = `${environment.baseUrl}Authorization/`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RolesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests role lists and role details', () => {
    service.getRoles().subscribe();
    http.expectOne(`${baseUrl}Role/List`).flush({ succeeded: true, data: [] });
    service.getRoleById('role-1').subscribe();
    http.expectOne(`${baseUrl}Role/role-1`).flush({ succeeded: true, data: { id: 'role-1' } });
  });

  it('uses the expected role mutation routes and payloads', () => {
    service.createRole('Manager').subscribe();
    const createRequest = http.expectOne(`${baseUrl}Role/Create`);
    expect(createRequest.request.body).toEqual({ roleName: 'Manager' });
    createRequest.flush({ succeeded: true });

    const edit = { roleId: 'role-1', roleName: 'Administrator' };
    service.editRole(edit).subscribe();
    const editRequest = http.expectOne(`${baseUrl}Role/Edit`);
    expect(editRequest.request.method).toBe('PUT');
    expect(editRequest.request.body).toEqual(edit);
    editRequest.flush({ succeeded: true });

    service.deleteRole('role-1').subscribe();
    http.expectOne(`${baseUrl}Role/Delete/role-1`).flush({ succeeded: true });
  });

  it('updates user roles and claims with their request objects', () => {
    const roles = { userId: 'user-1', roles: ['Manager'] };
    service.updateUserRoles(roles).subscribe();
    const rolesRequest = http.expectOne(`${baseUrl}User-Roles/Update`);
    expect(rolesRequest.request.body).toEqual(roles);
    rolesRequest.flush({ succeeded: true });

    const claims = {
      userId: 'user-1',
      userClaims: [{ permissionName: 'Items.View', hasPermission: true }],
    };
    service.updateUserClaims(claims).subscribe();
    const claimsRequest = http.expectOne(`${baseUrl}User-Claims/Update`);
    expect(claimsRequest.request.body).toEqual(claims);
    claimsRequest.flush({ succeeded: true });
  });

  it('uses the role-claims and permission endpoints', () => {
    service.getRoleClaims('role-1').subscribe();
    http.expectOne(`${baseUrl}Role-Claims/role-1`).flush({ succeeded: true, data: [] });
    service.getAllPermissions().subscribe();
    http.expectOne(`${baseUrl}User-Status/GetAllPermissions`).flush({ succeeded: true, data: [] });
  });
});
