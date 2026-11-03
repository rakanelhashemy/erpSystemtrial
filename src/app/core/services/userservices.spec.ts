import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { CurrentUser } from '../models/user-modal';
import { Userservices } from './userservices';

describe('Userservices', () => {
  let service: Userservices;
  let http: HttpTestingController;
  const baseUrl = `${environment.baseUrl}User`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(Userservices);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and stores the current user', () => {
    const user: CurrentUser = {
      id: 'user-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      roles: ['Admin'],
    };

    service.loadMe().subscribe((result) => expect(result).toEqual(user));
    http.expectOne(`${baseUrl}/Me`).flush({ succeeded: true, data: user });

    expect(service.currentUser()).toEqual(user);
    expect(service.initial()).toBe('A');
    expect(service.primaryRole()).toBe('Admin');
  });

  it('updates profile fields in the current-user signal after the API succeeds', () => {
    service.currentUser.set({
      id: 'user-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      roles: ['Admin'],
    });
    const payload = { fullName: 'Ada Byron', phone: '+20123456789' };

    service.updateProfile(payload).subscribe();
    const request = http.expectOne(`${baseUrl}/Profile`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    request.flush({ succeeded: true, data: 'Updated' });

    expect(service.currentUser()?.fullName).toBe('Ada Byron');
    expect(service.currentUser()?.phone).toBe('+20123456789');
    expect(service.currentUser()?.email).toBe('ada@example.com');
  });

  it('trims list search terms and omits empty searches', () => {
    service.list({ pageNumber: 2, pageSize: 10, search: '  ada  ' }).subscribe();
    const searchedRequest = http.expectOne((request) => request.url === `${baseUrl}/List`);
    expect(searchedRequest.request.params.get('pageNumber')).toBe('2');
    expect(searchedRequest.request.params.get('pageSize')).toBe('10');
    expect(searchedRequest.request.params.get('search')).toBe('ada');
    searchedRequest.flush({ succeeded: true, data: { data: [], currentPage: 2 } });

    service.list({ pageNumber: 1, pageSize: 10, search: '   ' }).subscribe();
    const emptySearchRequest = http.expectOne((request) => request.url === `${baseUrl}/List`);
    expect(emptySearchRequest.request.params.has('search')).toBe(false);
    emptySearchRequest.flush({ succeeded: true, data: { data: [], currentPage: 1 } });
  });

  it('clears current-user state', () => {
    service.currentUser.set({
      id: 'user-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      roles: [],
    });

    service.clear();

    expect(service.currentUser()).toBeNull();
    expect(service.initial()).toBe('?');
    expect(service.primaryRole()).toBe('');
  });
});
