import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CheckListFilterQuery,
  CheckList,
  CheckListDetail,
  CheckListRequest,
  CheckListPage,
} from '../models/checklist-modal';
import { ApiResponse } from '../models/general-model';
import { AuditItem, AuditItemsQuery, AuditResult } from '../models/audit-modal';

@Service()
export class ChecklistServices {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}CheckList`;

  private byId(id: string): string {
    return `${this.url}/${encodeURIComponent(id)}`;
  }

  list(query: CheckListFilterQuery): Observable<ApiResponse<CheckListPage>> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      const v = typeof value === 'string' ? value.trim() : value;
      if (v === '') return;
      params = params.set(key, String(v));
    });
    return this.http.get<ApiResponse<CheckListPage>>(`${this.url}/List`, { params });
  }

  getById(id: string): Observable<ApiResponse<CheckListDetail>> {
    return this.http.get<ApiResponse<CheckListDetail>>(this.byId(id));
  }

  create(body: CheckListRequest): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.url}/Create`, body);
  }

  update(id: string, body: CheckListRequest): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(`${this.url}/Update/${encodeURIComponent(id)}`, {
      ...body,
      id,
    });
  }

  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${encodeURIComponent(id)}`);
  }

  // ---------- Run Audit ----------
  auditItems(id: string, query: AuditItemsQuery): Observable<unknown> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      const v = typeof value === 'string' ? value.trim() : value;
      if (v === '') return;
      params = params.set(key, String(v));
    });
    return this.http.get<unknown>(`${this.byId(id)}/Audit/Items`, { params });
  }

  scan(id: string, code: string): Observable<ApiResponse<AuditItem>> {
    return this.http.post<ApiResponse<AuditItem>>(`${this.byId(id)}/Audit/Scan`, { code });
  }

  setResult(id: string, itemId: string, result: AuditResult): Observable<ApiResponse<unknown>> {
    return this.http.put<ApiResponse<unknown>>(
      `${this.byId(id)}/Audit/Items/${encodeURIComponent(itemId)}`,
      {
        result,
      },
    );
  }

  complete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(`${this.byId(id)}/Complete`, {});
  }
}
