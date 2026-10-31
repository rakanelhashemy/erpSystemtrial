import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Paged } from '../models/general-model';
import { LocationTypeFilterQuery, LocationType, LocationTypeRequest, LocationTypeDetails } from '../models/location-type-model';

@Service()
export class LocationTypeService {

     private readonly http = inject(HttpClient);

  private readonly url = `${environment.baseUrl}LocationType`;

  list({
    businessId,
    pageNumber,
    pageSize,
    search,
  }: LocationTypeFilterQuery): Observable<ApiResponse<Paged<LocationType>>> {
    let params = new HttpParams()
      .set('businessId', businessId)
      .set('pageNumber', pageNumber)
      .set('pageSize', pageSize);

    const term = search?.trim();
    if (term) params = params.set('search', term);

    return this.http.get<ApiResponse<Paged<LocationType>>>(`${this.url}/List`, { params });
  }

  getById(id: string): Observable<ApiResponse<LocationTypeDetails>> {
    return this.http.get<ApiResponse<LocationTypeDetails>>(`${this.url}/${id}`);
  }

 
  create(body: LocationTypeRequest): Observable<ApiResponse<string>> {
    return this.http.post<ApiResponse<string>>(`${this.url}/Create`, body);
  }

  update(id: string, body: LocationTypeRequest): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.url}/Update/${id}`, body);
  }

  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }
}
