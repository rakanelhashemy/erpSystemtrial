import { inject, Service } from '@angular/core';
import { environment } from '../../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiResponse, Paged } from '../models/general-model';
import { GroupFilterQuery, Group, GroupRequest } from '../models/group-modal';

@Service()
export class GroupService {
    private readonly http = inject(HttpClient);
 
  private readonly url = `${environment.baseUrl}Group`;
 
  list({ pageNumber, pageSize, search, parentId }: GroupFilterQuery): Observable<ApiResponse<Paged<Group>>> {
    let params = new HttpParams().set('pageNumber', pageNumber).set('pageSize', pageSize);
  
    const term = search.trim();
    if (term) params = params.set('search', term);
    if (parentId) params = params.set('parentId', parentId);
  
    return this.http.get<ApiResponse<Paged<Group>>>(`${this.url}/List`, { params });
  }
 
  getById(id: string): Observable<ApiResponse<Group>> {
    return this.http.get<ApiResponse<Group>>(`${this.url}/${id}`);
  }
 
  create(body: GroupRequest): Observable<ApiResponse<Group>> {
    return this.http.post<ApiResponse<Group>>(`${this.url}/Create`, body);
  }
 
  update(id: string, body: GroupRequest): Observable<ApiResponse<Group>> {
    return this.http.put<ApiResponse<Group>>(`${this.url}/Update/${id}`, body);
  }
 
  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }
}
