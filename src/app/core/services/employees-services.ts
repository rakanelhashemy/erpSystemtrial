import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EmployeeFilterQuery, Employee, EmployeeDetail, EmployeeRequest } from '../models/employee';
import { Paged, ApiResponse } from '../models/general-model';

@Service()
export class EmployeesServices {
    private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}Employee`;
 
  list(q: EmployeeFilterQuery): Observable<Paged<Employee>> {
    let params = new HttpParams().set('pageNumber', q.pageNumber).set('pageSize', q.pageSize);
 
    const set = (key: string, value: string) => {
      const v = value.trim();
      if (v) params = params.set(key, v);
    };
    set('search', q.search);
    set('jobTitle', q.jobTitle);
    set('phone', q.phone);
    set('email', q.email);
 
    if (q.departmentId) params = params.set('departmentId', q.departmentId);
    if (q.gender) params = params.set('gender', q.gender);
    if (q.active !== null) params = params.set('active', q.active);
 
    return this.http.get<Paged<Employee>>(`${this.url}/List`, { params });
  }
 
  getById(id: string): Observable<ApiResponse<EmployeeDetail>> {
    return this.http.get<ApiResponse<EmployeeDetail>>(`${this.url}/${id}`);
  }
 
  create(body: EmployeeRequest): Observable<ApiResponse<string>> {
    return this.http.post<ApiResponse<string>>(`${this.url}/Create`, body);
  }
 
  update(id: string, body: EmployeeRequest): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.url}/Update/${id}`, body);
  }
 
  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }
}
