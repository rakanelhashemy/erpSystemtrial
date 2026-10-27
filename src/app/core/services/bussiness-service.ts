import { HttpClient, HttpParams } from '@angular/common/http';
import {  inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment'; // adjust path
import { Business, BusinessRequest } from '../models/bussenies-model';
import { ApiResponse, FilterQuery, Paged } from '../models/general-model';


@Service()
export class BusinessService {
  private readonly http = inject(HttpClient);
 
  
  private readonly url = `${environment.baseUrl}Business`;
 
  list({ pageNumber, pageSize, search }: FilterQuery): Observable<ApiResponse<Paged<Business>>> {
    let params = new HttpParams().set('pageNumber', pageNumber).set('pageSize', pageSize);
 
    const term = search.trim();
    if (term) params = params.set('search', term);
 
    return this.http.get<ApiResponse<Paged<Business>>>(`${this.url}/List`, { params });
  }
 
  getById(id: string): Observable<ApiResponse<Business>> {
    return this.http.get<ApiResponse<Business>>(`${this.url}/${id}`);
  }
 
  create(body: BusinessRequest): Observable<ApiResponse<Business>> {
    return this.http.post<ApiResponse<Business>>(`${this.url}/Create`, body);
  }
 
  update(id: string, body: BusinessRequest): Observable<ApiResponse<Business>> {
    return this.http.put<ApiResponse<Business>>(`${this.url}/Update/${id}`, body);
  }
 
  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }
}