import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paged, ApiResponse } from '../models/general-model';
import { ItemFilterQuery, Item, ItemDetail, ItemRequest } from '../models/items-modal';

const toFormData = (body: Record<string, unknown>): FormData => {
  const form = new FormData();

  Object.entries(body).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;

    
    const field = key.charAt(0).toUpperCase() + key.slice(1);

    if (value instanceof File) form.append(field, value, value.name);
    else form.append(field, String(value));
  });

  return form;
};
@Service()
export class ItemsServices {
    private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}Item`;

  list(query: ItemFilterQuery): Observable<Paged<Item>> {
    let params = new HttpParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      const v = typeof value === 'string' ? value.trim() : value;
      if (v === '') return;
      params = params.set(key, String(v));
    });

    return this.http.get<Paged<Item>>(`${this.url}/List`, { params });
  }

  getById(id: string): Observable<ApiResponse<ItemDetail>> {
    return this.http.get<ApiResponse<ItemDetail>>(`${this.url}/${id}`);
  }

  create(body: ItemRequest): Observable<ApiResponse<string>> {
    return this.http.post<ApiResponse<string>>(`${this.url}/Create`, toFormData({ ...body }));
  }

  update(id: string, body: ItemRequest): Observable<ApiResponse<unknown>> {
    // the update schema expects the id in the body as well
    return this.http.put<ApiResponse<unknown>>(
      `${this.url}/Update/${id}`,
      toFormData({ ...body, id }),
    );
  }

  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }
}
