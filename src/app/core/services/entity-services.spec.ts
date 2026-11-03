import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { BusinessService } from './bussiness-service';
import { DepartmentService } from './depatment-service';
import { DropDownServices } from './drop-down-services';
import { EmployeesServices } from './employees-services';
import { GroupService } from './group-service';
import { ItemsServices } from './items-services';
import { LocationService } from './location-service';
import { LocationTypeService } from './location-type-service';
import { MaintenanceCompanyServices } from './maintenance-company-services';
import { Suppliers } from './suppliers-service';

describe('entity API services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('builds business list parameters and request URL', () => {
    TestBed.inject(BusinessService)
      .list({ pageNumber: 2, pageSize: 20, search: '  hotel ' })
      .subscribe();
    const request = http.expectOne((req) => req.url === `${environment.baseUrl}Business/List`);

    expect(request.request.params.get('pageNumber')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('20');
    expect(request.request.params.get('search')).toBe('hotel');
    request.flush({ succeeded: true, data: { data: [] } });
  });

  it('includes business and optional parent filters for locations', () => {
    TestBed.inject(LocationService)
      .list({
        businessId: 'business-1',
        parentId: 'parent-1',
        pageNumber: 1,
        pageSize: 10,
        search: '',
      })
      .subscribe();
    const request = http.expectOne((req) => req.url === `${environment.baseUrl}Location/List`);

    expect(request.request.params.get('businessId')).toBe('business-1');
    expect(request.request.params.get('parentId')).toBe('parent-1');
    expect(request.request.params.has('search')).toBe(false);
    request.flush({ succeeded: true, data: { data: [] } });
  });

  it('includes parent filters for groups', () => {
    TestBed.inject(GroupService)
      .list({ pageNumber: 1, pageSize: 10, search: '  group ', parentId: 'root' })
      .subscribe();
    const request = http.expectOne((req) => req.url === `${environment.baseUrl}Group/List`);

    expect(request.request.params.get('search')).toBe('group');
    expect(request.request.params.get('parentId')).toBe('root');
    request.flush({ succeeded: true, data: { data: [] } });
  });

  it('preserves false employee filters in query parameters', () => {
    TestBed.inject(EmployeesServices)
      .list({
        pageNumber: 1,
        pageSize: 10,
        search: '',
        jobTitle: '',
        phone: '',
        email: '',
        departmentId: '',
        gender: null,
        active: false,
      })
      .subscribe();
    const request = http.expectOne((req) => req.url === `${environment.baseUrl}Employee/List`);

    expect(request.request.params.get('active')).toBe('false');
    request.flush({ data: [], currentPage: 1, totalPages: 0, totalCount: 0 });
  });

  it('converts item create and update payloads to form data and includes the update id', () => {
    const service = TestBed.inject(ItemsServices);
    service.create({ name: 'Desk' } as never).subscribe();
    const createRequest = http.expectOne(`${environment.baseUrl}Item/Create`);
    expect(createRequest.request.body).toBeInstanceOf(FormData);
    expect((createRequest.request.body as FormData).get('Name')).toBe('Desk');
    createRequest.flush({ succeeded: true, data: 'item-1' });

    service.update('item-2', { name: 'Lamp' } as never).subscribe();
    const updateRequest = http.expectOne(`${environment.baseUrl}Item/Update/item-2`);
    expect((updateRequest.request.body as FormData).get('Id')).toBe('item-2');
    expect((updateRequest.request.body as FormData).get('Name')).toBe('Lamp');
    updateRequest.flush({ succeeded: true, data: null });
  });

  it('normalizes supplier fields and custom categories before posting', () => {
    TestBed.inject(Suppliers)
      .create({
        name: '  Supplier A  ',
        address: '  Cairo  ',
        notes: '  Preferred  ',
        categoryId: 'old-category',
        newCategoryName: '  New category  ',
        contactPeople: [
          { id: 'c-1', name: '  Alex ', position: ' Buyer ', phone: ' 123 ', email: ' x@y.com ' },
        ],
      } as never)
      .subscribe();
    const request = http.expectOne(`${environment.baseUrl}Supplier/Create`);

    expect(request.request.body).toMatchObject({
      name: 'Supplier A',
      address: 'Cairo',
      notes: 'Preferred',
      categoryId: null,
      newCategoryName: 'New category',
      contactPeople: [
        { id: 'c-1', name: 'Alex', position: 'Buyer', phone: '123', email: 'x@y.com' },
      ],
    });
    request.flush({ succeeded: true, data: 'supplier-1' });
  });

  it('removes contact ids from maintenance-company create requests', () => {
    TestBed.inject(MaintenanceCompanyServices)
      .create({
        name: '  Maintenance Co ',
        address: '  Giza ',
        notes: '',
        specialtyId: 'old-specialty',
        newSpecialtyName: '  Electrical ',
        contactPeople: [{ id: 'contact-1', name: '  Sara ', position: '', phone: '', email: '' }],
      } as never)
      .subscribe();
    const request = http.expectOne(`${environment.baseUrl}MaintenanceCompany/Create`);

    expect(request.request.body).toMatchObject({
      name: 'Maintenance Co',
      address: 'Giza',
      specialtyId: null,
      newSpecialtyName: 'Electrical',
      contactPeople: [{ name: 'Sara', position: '', phone: '', email: '' }],
    });
    expect(request.request.body.contactPeople[0]).not.toHaveProperty('id');
    request.flush({ succeeded: true, data: 'company-1' });
  });

  it('caches department lists and invalidates the cache after writes', () => {
    const service = TestBed.inject(DepartmentService);
    const query = { pageNumber: 1, pageSize: 10, search: '  finance ', parentId: '' };
    service.list(query).subscribe();
    service.list(query).subscribe();
    const firstRequest = http.expectOne(
      (req) => req.url === `${environment.baseUrl}Department/List`,
    );
    expect(firstRequest.request.params.get('search')).toBe('finance');
    firstRequest.flush({ succeeded: true, data: { data: [] } });

    service.list(query).subscribe();
    http.expectNone((req) => req.url === `${environment.baseUrl}Department/List`);

    service.create({ name: 'Finance' } as never).subscribe();
    http
      .expectOne(`${environment.baseUrl}Department/Create`)
      .flush({ succeeded: true, data: 'd-1' });
    service.list(query).subscribe();
    http
      .expectOne((req) => req.url === `${environment.baseUrl}Department/List`)
      .flush({
        succeeded: true,
        data: { data: [] },
      });
  });

  it('shares static dropdown lookups and adds language and query values', () => {
    const service = TestBed.inject(DropDownServices);
    service.staticLookups().subscribe();
    service.staticLookups().subscribe();
    const staticRequest = http.expectOne(`${environment.baseUrl}DropDown/StaticLookups`);
    staticRequest.flush({ succeeded: true, data: { countries: [], currencies: [], genders: [] } });
    service.staticLookups().subscribe();
    http.expectNone(`${environment.baseUrl}DropDown/StaticLookups`);

    service.businesses({ active: false, omitted: null }, 'ar').subscribe();
    const businessesRequest = http.expectOne(
      `${environment.baseUrl}DropDown/Businesses?active=false`,
    );
    expect(businessesRequest.request.headers.get('Accept-Language')).toBe('ar');
    expect(businessesRequest.request.params.has('omitted')).toBe(false);
    businessesRequest.flush({ succeeded: true, data: { data: [] } });
  });

  it('includes business id and paging options in location-type queries', () => {
    TestBed.inject(LocationTypeService)
      .list({ businessId: 'business-1', pageNumber: 3, pageSize: 25, search: '  room ' })
      .subscribe();
    const request = http.expectOne((req) => req.url === `${environment.baseUrl}LocationType/List`);

    expect(request.request.params.get('businessId')).toBe('business-1');
    expect(request.request.params.get('pageNumber')).toBe('3');
    expect(request.request.params.get('pageSize')).toBe('25');
    expect(request.request.params.get('search')).toBe('room');
    request.flush({ succeeded: true, data: { data: [] } });
  });
});
