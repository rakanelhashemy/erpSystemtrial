import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUser } from '../../../core/models/user-modal';
import { Userservices } from '../../../core/services/userservices';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  const user = signal<CurrentUser | null>({
    id: 'user-1',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: null,
    roles: ['Admin'],
  });
  const users = {
    currentUser: user,
    initial: computed(() => user()?.fullName.charAt(0) ?? '?'),
    primaryRole: computed(() => user()?.roles[0] ?? ''),
    loadMe: vi.fn(() => of(user()!)),
    clear: vi.fn(() => user.set(null)),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    user.set({
      id: 'user-1',
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      roles: ['Admin'],
    });
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [{ provide: Userservices, useValue: users }],
    }).compileComponents();
  });

  it('renders user details and emits menu toggles', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.componentRef.setInput('pageTitle', 'Employees');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Employees');
    expect(fixture.nativeElement.textContent).toContain('Ada Lovelace');
    expect(users.loadMe).not.toHaveBeenCalled();

    const toggle = vi.fn();
    fixture.componentInstance.toggleMenu.subscribe(toggle);
    fixture.nativeElement.querySelector('[aria-label="Toggle menu"]').click();
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('loads missing user details on initialization', () => {
    user.set(null);
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    expect(users.loadMe).toHaveBeenCalledOnce();
  });

  it('closes the account menu and emits profile and logout actions', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const editProfile = vi.fn();
    const logout = vi.fn();
    fixture.componentInstance.editProfile.subscribe(editProfile);
    fixture.componentInstance.logout.subscribe(logout);

    const accountButton = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    accountButton.click();
    fixture.detectChanges();
    const editButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Edit Profile'))!;
    editButton.click();
    fixture.detectChanges();

    expect(editProfile).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.dropdownOpen).toBe(false);

    accountButton.click();
    fixture.detectChanges();
    const logoutButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Logout'))!;
    logoutButton.click();

    expect(users.clear).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });
});
