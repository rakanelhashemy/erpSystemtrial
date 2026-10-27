import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DepartmentFilterQuery, Department, DepartmentDetails, DepartmentRequest } from '../models/depatment-modal';
import { ApiResponse, Paged } from '../models/general-model';
type ListResponse = ApiResponse<Paged<Department>>;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 50;
@Service()
export class DepartmentService {
    private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}Department`;

  private readonly listCache = new Map<string, { at: number; request$: Observable<ListResponse> }>();

  list({ pageNumber, pageSize, search, parentId }: DepartmentFilterQuery): Observable<ListResponse> {
    const term = search.trim();
    const key = `${parentId ?? ''}|${term}|${pageNumber}|${pageSize}`;

    const hit = this.listCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.request$;

    let params = new HttpParams().set('pageNumber', pageNumber).set('pageSize', pageSize);
    if (term) params = params.set('search', term);
    if (parentId) params = params.set('parentId', parentId);


    const request$ = this.http.get<ListResponse>(`${this.url}/List`, { params }).pipe(shareReplay(1));

    this.listCache.set(key, { at: Date.now(), request$ });
    if (this.listCache.size > CACHE_MAX_ENTRIES) {
      this.listCache.delete(this.listCache.keys().next().value!); // drop the oldest
    }
    return request$;
  }

  getById(id: string): Observable<ApiResponse<DepartmentDetails>> {
    return this.http.get<ApiResponse<DepartmentDetails>>(`${this.url}/${id}`);
  }

  create(body: DepartmentRequest): Observable<ApiResponse<string>> {
    return this.http
      .post<ApiResponse<string>>(`${this.url}/Create`, body)
      .pipe(tap(() => this.clearCache()));
  }

  update(id: string, body: DepartmentRequest): Observable<ApiResponse<unknown>> {
    return this.http
      .put<ApiResponse<unknown>>(`${this.url}/Update/${id}`, body)
      .pipe(tap(() => this.clearCache()));
  }

  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http
      .delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`)
      .pipe(tap(() => this.clearCache()));
  }

  clearCache(): void {
    this.listCache.clear();
  }

}
