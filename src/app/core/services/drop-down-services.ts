import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { map, Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Paged } from '../models/general-model';

export type Lang = 'en' | 'ar';

export interface DropdownItem<TId extends string | number = string> {
  id: TId;
  name: string;
  title?: string;
}

/** Departments come back as { id: uuid, title } (no `name`) */
export interface TitledItem<TId extends string | number = string> {
  id: TId;
  title: string;
}

export interface StaticLookups {
  countries: DropdownItem<number>[];
  currencies: DropdownItem<number>[];
  genders: DropdownItem<number>[];
  exportFormats?: DropdownItem<number>[];
}

export interface ItemFormLookups {
  itemNames: DropdownItem<number>[];
  brands: DropdownItem<number>[];
  itemModels: DropdownItem<number>[];
  materials: DropdownItem<number>[];
  departments: TitledItem<string>[];
  groups: DropdownItem<number>[];
  locations: DropdownItem<string>[]; // فاضية في الرد - غالباً محتاجة businessId
}

export interface ItemFormLookupsQuery {
  businessId?: string;
  pageSize?: number;
}

export type DropdownQuery = Record<string, string | number | boolean | null | undefined>;

@Service()
export class DropDownServices {
  private readonly http = inject(HttpClient);
  private readonly url = environment.baseUrl; // لازم تنتهي بـ /Api/V1/

  private toParams(query?: object): HttpParams {
    let params = new HttpParams();
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }

  private toHeaders(lang?: Lang): HttpHeaders | undefined {
    return lang ? new HttpHeaders({ 'Accept-Language': lang }) : undefined;
  }

  private get<TId extends string | number = string>(
    path: string,
    query?: DropdownQuery,
    lang?: Lang,
  ): Observable<ApiResponse<Paged<DropdownItem<TId>>>> {
    return this.http.get<ApiResponse<Paged<DropdownItem<TId>>>>(`${this.url}${path}`, {
      params: this.toParams(query),
      headers: this.toHeaders(lang),
    });
  }

  users(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDownusers', query, lang);
  }
  businesses(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Businesses', query, lang);
  }
  locationTypes(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/LocationTypes', query, lang);
  }
  locations(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Locations', query, lang);
  }
  groups(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Groups', query, lang);
  }
  departments(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Departments', query, lang);
  }
  suppliers(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Suppliers', query, lang);
  }
  maintenanceCompanies(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/MaintenanceCompanies', query, lang);
  }
  employees(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Employees', query, lang);
  }
  materials(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Materials', query, lang);
  }
  itemNames(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/ItemNames', query, lang);
  }
  itemModels(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/ItemModels', query, lang);
  }
  items(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Items', query, lang);
  } // كان ناقص
  brands(query?: DropdownQuery, lang?: Lang) {
    return this.get('DropDown/Brands', query, lang);
  }

  supplierCategories(query?: DropdownQuery, lang?: Lang) {
    return this.get<number>('DropDown/SupplierCategories', query, lang);
  }

  maintenanceCompanySpecialties(query?: DropdownQuery, lang?: Lang) {
    return this.get<number>('DropDown/MaintenanceCompanySpecialties', query, lang);
  }

  itemFormLookups(query?: ItemFormLookupsQuery, lang?: Lang): Observable<ItemFormLookups> {
    return this.http
      .get<ApiResponse<ItemFormLookups>>(`${this.url}DropDown/item-form-lookups`, {
        params: this.toParams(query),
        headers: this.toHeaders(lang),
      })
      .pipe(map((res) => res.data));
  }

  private staticLookups$?: Observable<StaticLookups>;
  staticLookups(): Observable<StaticLookups> {
    return (this.staticLookups$ ??= this.http
      .get<ApiResponse<StaticLookups>>(`${this.url}DropDown/StaticLookups`)
      .pipe(
        map((res) => res.data),
        shareReplay({ bufferSize: 1, refCount: false }),
      ));
  }
}
