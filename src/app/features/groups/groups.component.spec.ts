import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group } from '../../core/models/group-modal';
import { GroupService } from '../../core/services/group-service';
import { GroupsComponent } from './groups.component';

describe('GroupsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupsComponent],
      providers: [{ provide: GroupService, useValue: { list: vi.fn() } }],
    }).compileComponents();
  });

  it('tracks nested group navigation and resets filters when changing levels', () => {
    const component = TestBed.createComponent(GroupsComponent).componentInstance;
    const parent: Group = { id: 'parent', name: 'Parent', code: 'P' };
    const child: Group = { id: 'child', name: 'Child', code: 'C', parentId: 'parent' };

    component.setSearchTerm('chair');
    component.currentPage.set(3);
    component.openChild(parent);
    component.openChild(child);
    expect(component.currentGroup()).toEqual(child);
    expect(component.breadcrumb()).toEqual([parent, child]);
    expect(component.searchTerm()).toBe('');
    expect(component.currentPage()).toBe(1);

    component.setSearchTerm('desk');
    component.goToBreadcrumb('parent');
    expect(component.breadcrumb()).toEqual([parent]);
    expect(component.currentGroup()).toEqual(parent);
    expect(component.searchTerm()).toBe('');

    component.goToBreadcrumb(null);
    expect(component.breadcrumb()).toEqual([]);
    expect(component.currentGroup()).toBeNull();
  });

  it('does not navigate to a breadcrumb that is not in the current path', () => {
    const component = TestBed.createComponent(GroupsComponent).componentInstance;
    const group: Group = { id: 'group-1', name: 'Group', code: 'G' };
    component.openChild(group);
    component.goToBreadcrumb('missing');

    expect(component.breadcrumb()).toEqual([group]);
  });

  it('clamps paging and opens edit state for the selected group', () => {
    const component = TestBed.createComponent(GroupsComponent).componentInstance;
    component.total.set(30);
    component.nextPage();
    expect(component.currentPage()).toBe(2);
    component.prevPage();
    expect(component.currentPage()).toBe(1);
    component.prevPage();
    expect(component.currentPage()).toBe(1);

    const group: Group = { id: 'group-2', name: 'Furniture', code: 'F' };
    component.openEdit(group);
    expect(component.modalOpen()).toBe(true);
    expect(component.modalGroup()).toEqual(group);
  });
});
