import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Department } from '../../core/models/depatment-modal';
import { DepartmentService } from '../../core/services/depatment-service';
import { DepartmentsComponent } from './departments.component';

describe('DepartmentsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DepartmentsComponent],
      providers: [{ provide: DepartmentService, useValue: { list: vi.fn(), getById: vi.fn() } }],
    }).compileComponents();
  });

  it('tracks department hierarchy and returns to a selected breadcrumb', () => {
    const component = TestBed.createComponent(DepartmentsComponent).componentInstance;
    const parent: Department = { id: 'parent', title: 'Operations', code: 'OPS' };
    const child: Department = { id: 'child', title: 'Housekeeping', code: 'HK' };

    component.searchTerm.set('room');
    component.openChild(parent);
    component.openChild(child);
    expect(component.currentDepartment()).toEqual(child);
    expect(component.breadcrumb()).toEqual([parent, child]);
    expect(component.searchTerm()).toBe('');

    component.goToBreadcrumb('parent');
    expect(component.breadcrumb()).toEqual([parent]);
    component.goToBreadcrumb(null);
    expect(component.breadcrumb()).toEqual([]);
  });

  it('ignores invalid breadcrumbs and opens add or edit modal state', () => {
    const component = TestBed.createComponent(DepartmentsComponent).componentInstance;
    const department: Department = { id: 'd-1', title: 'Finance', code: 'FIN' };
    component.openChild(department);
    component.goToBreadcrumb('missing');
    expect(component.breadcrumb()).toEqual([department]);

    component.openAdd();
    expect(component.modalOpen()).toBe(true);
    expect(component.modalDepartment()).toBeNull();
    component.openEdit(department);
    expect(component.modalDepartment()).toEqual(department);
    component.closeModal();
    expect(component.modalOpen()).toBe(false);
    expect(component.modalDepartment()).toBeNull();
  });
});
