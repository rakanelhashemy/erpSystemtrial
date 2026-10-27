import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { map, Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Paged } from '../models/general-model';

export interface DropdownItem<TId extends string | number = string> {
  id: TId;
  name: string;
  title?: string;
}
export interface StaticLookups {
  countries: DropdownItem<number>[];
  currencies: DropdownItem<number>[];
  genders: DropdownItem<number>[];
}
export type DropdownQuery = Record<string, string | number | boolean | null | undefined>;
 
@Service()
export class DropDownServices {
  private readonly http = inject(HttpClient);
  private readonly url = environment.baseUrl;
 
  private get<TId extends string | number = string>(
    path: string,
    query?: DropdownQuery,
  ): Observable<ApiResponse<Paged<DropdownItem<TId>>>> {
    let params = new HttpParams();
 
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });
 
    return this.http.get<ApiResponse<Paged<DropdownItem<TId>>>>(`${this.url}${path}`, { params });
  }
 
  users(query?: DropdownQuery)                { return this.get('DropDownusers', query); }
  businesses(query?: DropdownQuery)           { return this.get('DropDown/Businesses', query); }
  locationTypes(query?: DropdownQuery)        { return this.get('DropDown/LocationTypes', query); }
  locations(query?: DropdownQuery)            { return this.get('DropDown/Locations', query); }
  groups(query?: DropdownQuery)               { return this.get('DropDown/Groups', query); }
  departments(query?: DropdownQuery)          { return this.get('DropDown/Departments', query); }
  suppliers(query?: DropdownQuery)            { return this.get('DropDown/Suppliers', query); }
  maintenanceCompanies(query?: DropdownQuery) { return this.get('DropDown/MaintenanceCompanies', query); }
  employees(query?: DropdownQuery)            { return this.get('DropDown/Employees', query); }
  materials(query?: DropdownQuery)            { return this.get('DropDown/Materials', query); }
  itemNames(query?: DropdownQuery)            { return this.get('DropDown/ItemNames', query); }
  itemModels(query?: DropdownQuery)           { return this.get('DropDown/ItemModels', query); }
  brands(query?: DropdownQuery)               { return this.get('DropDown/Brands', query); }
 

  private staticLookups$?: Observable<StaticLookups>;
  staticLookups(): Observable<StaticLookups> {
    return (this.staticLookups$ ??= this.http
      .get<ApiResponse<StaticLookups>>(`${this.url}DropDown/StaticLookups`)
      .pipe(
        map((res) => res.data),
        shareReplay({ bufferSize: 1, refCount: false }),
      ));
  }
 
  supplierCategories(query?: DropdownQuery) {
    return this.get<number>('DropDown/SupplierCategories', query);
  }
 
  maintenanceCompanySpecialties(query?: DropdownQuery) {
    return this.get<number>('DropDown/MaintenanceCompanySpecialties', query);
  }
}
