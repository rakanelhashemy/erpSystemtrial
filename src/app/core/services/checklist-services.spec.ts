import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { ChecklistServices } from './checklist-services';

describe('ChecklistServices audit requests', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests a page with trimmed search and optional status filters', () => {
    TestBed.inject(ChecklistServices)
      .auditItems('audit-1', {
        pageNumber: 2,
        pageSize: 10,
        search: '  laptop  ',
        status: 'Missing',
        id: 'item-1',
        code: '10138',
        brandId: 3,
        modelId: 4,
        materialId: 5,
        countryId: 6,
        departmentId: 'department-1',
        capacity: '2 TB',
      })
      .subscribe();

    const request = http.expectOne(
      (req) => req.url === `${environment.baseUrl}CheckList/audit-1/Audit/Items`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('pageNumber')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.get('search')).toBe('laptop');
    expect(request.request.params.get('status')).toBe('Missing');
    expect(request.request.params.get('id')).toBe('item-1');
    expect(request.request.params.get('code')).toBe('10138');
    expect(request.request.params.get('brandId')).toBe('3');
    expect(request.request.params.get('modelId')).toBe('4');
    expect(request.request.params.get('materialId')).toBe('5');
    expect(request.request.params.get('countryId')).toBe('6');
    expect(request.request.params.get('departmentId')).toBe('department-1');
    expect(request.request.params.get('capacity')).toBe('2 TB');
    request.flush({ succeeded: true, data: { data: [] } });
  });

  it('encodes route identifiers and sends the documented scan and result payloads', () => {
    const service = TestBed.inject(ChecklistServices);
    service.scan('audit/1', 'SN-123').subscribe();
    const scan = http.expectOne(
      (req) => req.url === `${environment.baseUrl}CheckList/audit%2F1/Audit/Scan`,
    );
    expect(scan.request.method).toBe('POST');
    expect(scan.request.body).toEqual({ code: 'SN-123' });
    scan.flush({ succeeded: true, data: null });

    service.setResult('audit/1', 'item/2', 'Checked').subscribe();
    const result = http.expectOne(
      (req) => req.url === `${environment.baseUrl}CheckList/audit%2F1/Audit/Items/item%2F2`,
    );
    expect(result.request.method).toBe('PUT');
    expect(result.request.body).toEqual({ result: 'Checked' });
    result.flush({ succeeded: true, data: null });
  });

  it('posts completion to the selected checklist', () => {
    TestBed.inject(ChecklistServices).complete('audit-1').subscribe();
    const request = http.expectOne(`${environment.baseUrl}CheckList/audit-1/Complete`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ succeeded: true, data: null });
  });
});
