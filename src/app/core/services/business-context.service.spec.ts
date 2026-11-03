import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessContextService } from './business-context.service';

describe('BusinessContextService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores a valid saved business selection', () => {
    localStorage.setItem('selectedBusiness', JSON.stringify({ id: 'b-1', name: 'Main Hotel' }));
    const service = TestBed.inject(BusinessContextService);

    expect(service.selectedBusiness()).toEqual({ id: 'b-1', name: 'Main Hotel' });
  });

  it('ignores malformed saved JSON', () => {
    localStorage.setItem('selectedBusiness', '{invalid-json');
    expect(TestBed.inject(BusinessContextService).selectedBusiness()).toBeNull();
  });

  it('ignores saved values that do not match the selection shape', () => {
    localStorage.setItem('selectedBusiness', JSON.stringify({ id: 4, name: 'Invalid' }));
    expect(TestBed.inject(BusinessContextService).selectedBusiness()).toBeNull();
  });

  it('persists and clears selections', () => {
    const service = TestBed.inject(BusinessContextService);
    const business = { id: 'b-2', name: 'City Hotel' };

    service.select(business);
    expect(service.selectedBusiness()).toEqual(business);
    expect(JSON.parse(localStorage.getItem('selectedBusiness') ?? 'null')).toEqual(business);

    service.clear();
    expect(service.selectedBusiness()).toBeNull();
    expect(localStorage.getItem('selectedBusiness')).toBeNull();
  });
});
