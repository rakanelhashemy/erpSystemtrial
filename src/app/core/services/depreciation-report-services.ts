import { HttpParams, HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DepreciationReportQuery,
  DepreciationItemsReport,
  DepreciationGroupsReport,
} from '../models/depreciation-report-modal';
import { ApiResponse } from '../models/general-model';

const toParams = (query: object): HttpParams => {
  let params = new HttpParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    const v = typeof value === 'string' ? value.trim() : value;
    if (v === '') return;
    params = params.set(key, String(v));
  });

  return params;
};

@Service()
export class DepreciationReportServices {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}DepreciationReport`;

  items(query: DepreciationReportQuery): Observable<ApiResponse<DepreciationItemsReport>> {
    return this.http.get<ApiResponse<DepreciationItemsReport>>(`${this.url}/Items`, {
      params: toParams(query),
    });
  }

  groups(query: DepreciationReportQuery): Observable<ApiResponse<DepreciationGroupsReport>> {
    return this.http.get<ApiResponse<DepreciationGroupsReport>>(`${this.url}/Groups`, {
      params: toParams(query),
    });
  }

  exportItems(query: DepreciationReportQuery, exportFormatId: number): Observable<Blob> {
    return this.http.get(`${this.url}/Items/Export`, {
      params: toParams({ ...query, exportFormatId }),
      responseType: 'blob',
    });
  }

  exportGroups(query: DepreciationReportQuery, exportFormatId: number): Observable<Blob> {
    return this.http.get(`${this.url}/Groups/Export`, {
      params: toParams({ ...query, exportFormatId }),
      responseType: 'blob',
    });
  }
}
