import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserStatus } from '../../core/models/user-modal';
import { Userservices } from '../../core/services/userservices';
import { UsersComponent } from './users.component';

describe('UsersComponent', () => {
  const usersApi = {
    list: vi.fn(() => of({ data: [], currentPage: 1, totalPages: 1, totalCount: 0 })),
    getById: vi.fn(() => of({ succeeded: true, data: {} })),
    updateStatus: vi.fn(() => of({ succeeded: true, data: 'Updated' })),
  };
  const user: User = {
    id: 'user-1',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: null,
    status: UserStatus.Invited,
    statusLabel: 'Invited',
    createdBy: null,
    lastUpdatedBy: null,
    roles: ['Admin'],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    usersApi.list.mockReturnValue(of({ data: [], currentPage: 1, totalPages: 1, totalCount: 0 }));
    usersApi.getById.mockReturnValue(of({ succeeded: true, data: {} }));
    usersApi.updateStatus.mockReturnValue(of({ succeeded: true, data: 'Updated' }));
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [{ provide: Userservices, useValue: usersApi }],
    }).compileComponents();
  });

  it('maps status values to their display classes', () => {
    const component = TestBed.createComponent(UsersComponent).componentInstance;
    expect(component.statusClass(UserStatus.Active)).toContain('emerald');
    expect(component.statusClass(UserStatus.Invited)).toContain('sky');
    expect(component.statusClass(UserStatus.Suspended)).toContain('rose');
    expect(component.statusPickClass(UserStatus.Active, UserStatus.Active)).toContain('ring-2');
  });

  it('updates a user status and keeps the details state in sync', () => {
    const component = TestBed.createComponent(UsersComponent).componentInstance;
    component.openDetails(user);
    component.changeStatus(user, UserStatus.Active);

    expect(usersApi.updateStatus).toHaveBeenCalledWith('user-1', UserStatus.Active);
    expect(component.detailsUser()).toMatchObject({
      id: 'user-1',
      status: UserStatus.Active,
      statusLabel: 'Active',
    });
    expect(component.statusUpdating()).toBe(false);
  });

  it('suspends a user from the row action instead of deleting them', () => {
    const component = TestBed.createComponent(UsersComponent).componentInstance;
    const event = new MouseEvent('click', { bubbles: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    component.suspendUser(event, user);

    expect(usersApi.updateStatus).toHaveBeenCalledWith('user-1', UserStatus.Suspended);
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(component.detailsUser()).toBeNull();
  });

  it('ignores duplicate status updates and reports API errors', () => {
    const component = TestBed.createComponent(UsersComponent).componentInstance;
    component.changeStatus(user, UserStatus.Invited);
    expect(usersApi.updateStatus).not.toHaveBeenCalled();

    usersApi.updateStatus.mockReturnValueOnce(
      throwError(() => ({ error: { message: 'Not allowed' } })),
    );
    component.changeStatus(user, UserStatus.Active);
    expect(component.statusError()).toBe('Not allowed');
    expect(component.statusUpdating()).toBe(false);
  });
});
