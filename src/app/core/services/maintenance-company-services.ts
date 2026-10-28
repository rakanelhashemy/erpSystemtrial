import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paged, ApiResponse } from '../models/general-model';
import { MaintenanceCompany, MaintenanceCompanyDetail, MaintenanceCompanyFilterQuery, MaintenanceCompanyRequest } from '../models/maintenance-company-modal';

@Service()
export class MaintenanceCompanyServices {private readonly http = inject(HttpClient);
  private readonly url = `${environment.baseUrl}MaintenanceCompany`;
 
  list({ pageNumber, pageSize, search, address, specialtyId }: MaintenanceCompanyFilterQuery): Observable<Paged<MaintenanceCompany>> {
    let params = new HttpParams().set('pageNumber', pageNumber).set('pageSize', pageSize);
 
    const term = search.trim();
    if (term) params = params.set('search', term);
    if (address?.trim()) params = params.set('address', address.trim());
    if (specialtyId) params = params.set('specialtyId', specialtyId);
 
    return this.http.get<Paged<MaintenanceCompany>>(`${this.url}/List`, { params });
  }
 
  getById(id: string): Observable<ApiResponse<MaintenanceCompanyDetail>> {
    return this.http.get<ApiResponse<MaintenanceCompanyDetail>>(`${this.url}/${id}`);
  }
 
  create(body: MaintenanceCompanyRequest): Observable<ApiResponse<string>> {
    // the create schema has no contact id
    const normalized = this.normalize(body);
    const payload = {
      ...normalized,
      contactPeople: normalized.contactPeople.map(({ id, ...rest }) => rest),
    };
    return this.http.post<ApiResponse<string>>(`${this.url}/Create`, payload);
  }
 
  update(id: string, body: MaintenanceCompanyRequest): Observable<ApiResponse<unknown>> {
    // the update schema expects the id in the body as well
    return this.http.put<ApiResponse<unknown>>(`${this.url}/Update/${id}`, { id, ...this.normalize(body) });
  }

  private normalize(body: MaintenanceCompanyRequest): MaintenanceCompanyRequest {
    const newName = body.newSpecialtyName?.trim();
    return {
      ...body,
      name: body.name.trim(),
      address: body.address?.trim() ?? '',
      notes: body.notes?.trim() ?? '',
      specialtyId: newName ? null : body.specialtyId,
      newSpecialtyName: newName || null,
      contactPeople: (body.contactPeople ?? []).map((contact) => ({
        ...contact,
        name: contact.name?.trim() ?? '',
        position: contact.position?.trim() ?? '',
        phone: contact.phone?.trim() ?? '',
        email: contact.email?.trim() ?? '',
      })),
    };
  }
 
  delete(id: string): Observable<ApiResponse<unknown>> {
    return this.http.delete<ApiResponse<unknown>>(`${this.url}/Delete/${id}`);
  }}
