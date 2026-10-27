import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, throwError, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Claim {
  permissionName: string;
  hasPermission: boolean;
}

export interface RoleEdit {
  roleId: string;
  roleName: string;
}

export interface UserRolesUpdate {
  userId: string;
  roles: string[];
}

export interface UserClaimsUpdate {
  userId: string;
  userClaims: Claim[];
}

export interface RoleClaimsUpdate {
  roleId: string;
  roleClaims: Claim[];
}

@Service()
export class RolesService {
  private readonly httpClient = inject(HttpClient);

  private readonly baseUrl = `${environment.baseUrl}Authorization/`;

  private handleError = (error: any): Observable<never> => throwError(() => error);

  // ---------- Role ----------

  getRoles(): Observable<any> {
    return this.httpClient.get(`${this.baseUrl}Role/List`).pipe(catchError(this.handleError));
  }

  getRoleById(id: string): Observable<any> {
    return this.httpClient.get(`${this.baseUrl}Role/${id}`).pipe(catchError(this.handleError));
  }

  createRole(name: string): Observable<any> {
    return this.httpClient
      .post(`${this.baseUrl}Role/Create`, { roleName: name })
      .pipe(catchError(this.handleError));
  }

  editRole(data: RoleEdit): Observable<any> {
    return this.httpClient.put(`${this.baseUrl}Role/Edit`, data).pipe(catchError(this.handleError));
  }

  deleteRole(id: string): Observable<any> {
    return this.httpClient
      .delete(`${this.baseUrl}Role/Delete/${id}`)
      .pipe(catchError(this.handleError));
  }

  // ---------- User Roles ----------

  getUserRoles(id: string): Observable<any> {
    return this.httpClient
      .get(`${this.baseUrl}User-Roles/${id}`)
      .pipe(catchError(this.handleError));
  }

  updateUserRoles(data: UserRolesUpdate): Observable<any> {
    return this.httpClient
      .put(`${this.baseUrl}User-Roles/Update`, data)
      .pipe(catchError(this.handleError));
  }

  // ---------- User Claims ----------

  getUserClaims(id: string): Observable<any> {
    return this.httpClient
      .get<unknown>(`${this.baseUrl}User-Claims/${id}`)
      .pipe(catchError(this.handleError));
  }

  updateUserClaims(data: UserClaimsUpdate): Observable<any> {
    return this.httpClient
      .put(`${this.baseUrl}User-Claims/Update`, data)
      .pipe(catchError(this.handleError));
  }

  // ---------- Role Claims ----------

  getRoleClaims(id: string): Observable<any> {
    return this.httpClient
      .get(`${this.baseUrl}Role-Claims/${id}`)
      .pipe(catchError(this.handleError));
  }

  updateRoleClaims(data: RoleClaimsUpdate): Observable<any> {
    return this.httpClient
      .put(`${this.baseUrl}Role-Claims/Update`, data)
      .pipe(catchError(this.handleError));
  }

  // ---------- User Status ----------

  getAllPermissions(): Observable<any> {
    return this.httpClient
      .get(`${this.baseUrl}User-Status/GetAllPermissions`)
      .pipe(catchError(this.handleError));
  }
}
