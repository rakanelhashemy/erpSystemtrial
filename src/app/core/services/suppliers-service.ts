import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paged, ApiResponse } from '../models/general-model';
import { SupplierFilterQuery, Supplier, SupplierDetail, SupplierRequest } from '../models/supplires-Modal';

@Service()
export class Suppliers {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}Supplier`;
list({ pageNumber, pageSize, search, address, categoryId }: SupplierFilterQuery): Observable<Paged<Supplier>> {
  let params = new HttpParams().set('pageNumber', pageNumber).set('pageSize', pageSize);

  const term = search.trim();
  if (term) params = params.set('search', term);
  if (address?.trim()) params = params.set('address', address.trim());
  if (categoryId) params = params.set('categoryId', categoryId);

  return this.http.get<Paged<Supplier>>(`${this.url}/List`, { params });
}

  getById(id: string): Observable<ApiResponse<SupplierDetail>> {
    return this.http.get<ApiResponse<SupplierDetail>>(`${this.url}/${id}`);
  }

  create(body: SupplierRequest): Observable<ApiResponse<string>> {
    return this.http.post<ApiResponse<string>>(`${this.url}/Create`, body);
  }

  update(id: string, body: SupplierRequest): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.url}/Update/${id}`, body);
  }

  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }
}
