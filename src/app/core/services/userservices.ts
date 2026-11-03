import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paged, ApiResponse } from '../models/general-model';
import {
  UserFilterQuery,
  User,
  UserDetail,
  UserStatus,
  CurrentUser,
  UpdateProfileRequest, 
} from '../models/user-modal';

@Service()
export class Userservices {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}User`;


  readonly currentUser = signal<CurrentUser | null>(null);

  readonly initial = computed(() =>
    this.currentUser()?.fullName?.trim().charAt(0).toUpperCase() ?? '?'
  );

  readonly primaryRole = computed(() => this.currentUser()?.roles?.[0] ?? '');

 
  loadMe(): Observable<CurrentUser> {
    return this.http.get<ApiResponse<CurrentUser>>(`${this.url}/Me`).pipe(
      map((res) => res.data),
      tap((user) => this.currentUser.set(user))
    );
  }

 
  updateProfile(payload: UpdateProfileRequest): Observable<ApiResponse<string>> {
    return this.http.put<ApiResponse<string>>(`${this.url}/Profile`, payload).pipe(
      tap(() =>
        this.currentUser.update((u) => (u ? { ...u, ...payload } : u))
      )
    );
  }

  clear() {
    this.currentUser.set(null);
  }

  /** The API wraps the page in ApiResponse, so unwrap it to keep the component simple. */
  list({ pageNumber, pageSize, search }: UserFilterQuery): Observable<Paged<User>> {
    let params = new HttpParams().set('pageNumber', pageNumber).set('pageSize', pageSize);

    const term = search.trim();
    if (term) params = params.set('search', term);

    return this.http
      .get<ApiResponse<Paged<User>>>(`${this.url}/List`, { params })
      .pipe(map((res) => res.data));
  }

  getById(id: string): Observable<ApiResponse<UserDetail>> {
    return this.http.get<ApiResponse<UserDetail>>(`${this.url}/${id}`);
  }

  updateStatus(id: string, newStatus: UserStatus): Observable<ApiResponse<string>> {
    return this.http.patch<ApiResponse<string>>(`${this.url}/${id}/Status`, { newStatus });
  }
}