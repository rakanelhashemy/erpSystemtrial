import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth-service/auth-service';
import { CurrentUser } from '../../core/models/user-modal';
import { Userservices } from '../../core/services/userservices';
import { MainLayoutComponent } from './main-layout.component';

describe('MainLayoutComponent', () => {
  const currentUser = signal<CurrentUser | null>({
    id: 'user-1',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: null,
    roles: ['Admin'],
  });
  const users = {
    currentUser,
    initial: computed(() => currentUser()?.fullName.charAt(0) ?? '?'),
    primaryRole: computed(() => currentUser()?.roles[0] ?? ''),
    loadMe: vi.fn(() => of(currentUser()!)),
    updateProfile: vi.fn(() => of({ succeeded: true, data: 'Updated' })),
    clear: vi.fn(() => currentUser.set(null)),
  };
  const auth = {
    language: signal<'en' | 'ar'>('en').asReadonly(),
    hasPermission: vi.fn(() => false),
    getMyPermissions: vi.fn(() => of({ succeeded: true, data: [] })),
    changePassword: vi.fn(() => of({ succeeded: true })),
    revokeAllSessions: vi.fn(() => of({ succeeded: true })),
    logout: vi.fn(() => of({ succeeded: true })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    currentUser.set({
      id: 'user-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      roles: ['Admin'],
    });
    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: Userservices, useValue: users },
      ],
    }).compileComponents();
  });

  it('loads permissions and the current user when initialized', () => {
    const fixture = TestBed.createComponent(MainLayoutComponent);
    fixture.detectChanges();

    expect(auth.getMyPermissions).toHaveBeenCalledOnce();
    expect(users.loadMe).toHaveBeenCalledOnce();
  });

  it('saves normalized profile data and closes the editor after success', () => {
    const fixture = TestBed.createComponent(MainLayoutComponent);
    const component = fixture.componentInstance;
    component.openEditProfile();
    component.profileForm.controls.firstName.setValue('Ada');
    component.profileForm.controls.lastName.setValue('Byron');
    component.profileForm.controls.phone.setValue('   ');
    component.saveProfile();

    expect(users.updateProfile).toHaveBeenCalledWith({ fullName: 'Ada Byron', phone: null });
    expect(component.editProfileOpen()).toBe(false);
    expect(component.saving()).toBe(false);
  });

  it('sends the required fields to change-password and revoke-sessions endpoints', () => {
    const component = TestBed.createComponent(MainLayoutComponent).componentInstance;
    component.passwordForm.setValue({
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
      confirmPassword: 'new-password-1',
    });
    component.savePassword();
    expect(auth.changePassword).toHaveBeenCalledWith({
      userId: 'user-1',
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
      confirmNewPassword: 'new-password-1',
    });
    expect(component.passwordSuccess()).toBe(true);

    component.terminateSessions();
    expect(auth.revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(component.terminateSuccess()).toBe(true);
  });

  it('does not submit invalid profile or mismatched password forms', () => {
    const component = TestBed.createComponent(MainLayoutComponent).componentInstance;
    component.saveProfile();
    component.passwordForm.setValue({
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
      confirmPassword: 'different-password',
    });
    component.savePassword();

    expect(users.updateProfile).not.toHaveBeenCalled();
    expect(auth.changePassword).not.toHaveBeenCalled();
    expect(component.passwordForm.hasError('mismatch')).toBe(true);
  });
});
