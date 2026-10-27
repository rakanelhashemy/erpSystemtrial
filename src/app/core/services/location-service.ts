import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Paged } from '../models/general-model';
import { LocationFilterQuery, LocationItem, LocationRequest } from '../models/location-modal';

@Service()
export class LocationService {
    private readonly http = inject(HttpClient);
 
  private readonly url = `${environment.baseUrl}Location`;
 
  list({ pageNumber, pageSize, search, parentId, businessId }: LocationFilterQuery): Observable<ApiResponse<Paged<LocationItem>>> {
    let params = new HttpParams()
      .set('businessId', businessId)
      .set('pageNumber', pageNumber)
      .set('pageSize', pageSize);
 
    const term = search.trim();
    if (term) params = params.set('search', term);
    if (parentId) params = params.set('parentId', parentId);
 
    return this.http.get<ApiResponse<Paged<LocationItem>>>(`${this.url}/List`, { params });
  }
 
  getById(id: string): Observable<ApiResponse<LocationItem>> {
    return this.http.get<ApiResponse<LocationItem>>(`${this.url}/${id}`);
  }
 
  create(body: LocationRequest): Observable<ApiResponse<LocationItem>> {
    return this.http.post<ApiResponse<LocationItem>>(`${this.url}/Create`, body);
  }
 
  update(id: string, body: LocationRequest): Observable<ApiResponse<LocationItem>> {
    return this.http.put<ApiResponse<LocationItem>>(`${this.url}/Update/${id}`, body);
  }
 
  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }
}
