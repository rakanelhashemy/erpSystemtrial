import {
  Component,
  computed,
  DestroyRef,
  effect,
  HostListener,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toSignal, toObservable, rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  debounceTime,
  map,
  distinctUntilChanged,
  catchError,
  EMPTY,
  finalize,
  forkJoin,
  of,
  tap,
  Subscription,
} from 'rxjs';
import {
  InviteUserRequest,
  User,
  UpdateUserRequest,
  USER_STATUS_OPTIONS,
  UserStatus,
} from '../../core/models/user-modal';
import { Userservices } from '../../core/services/userservices';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { toast } from 'ngx-sonner';
import { AuthService } from '../../core/auth/auth-service/auth-service';
import { ActivatedRoute, Router } from '@angular/router';
import { DropDownServices, DropdownItem } from '../../core/services/drop-down-services';
import { AllPermissionsModule, Claim, RolesService } from '../../core/services/roles-service';
import {
  LazyDropdownComponent,
  LazyDropdownOption,
} from '../../shared/ui/lazy-dropdown/lazy-dropdown.component';

const CRUD_ACTIONS = ['View', 'Add', 'Edit', 'Delete'] as const;

interface PermissionCell {
  permission: string;
  label: string;
}

interface PermissionRow {
  module: string;
  cells: (PermissionCell | null)[];
}

interface ExtraPermission {
  permission: string;
  label: string;
}

const MODULE_LABELS: Record<string, string> = {
  LocationTypes: 'Location Types',
  MaintenanceCompanies: 'Maintenance Companies',
  CheckLists: 'Check Lists',
};

const displayName = (value: string): string =>
  value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());

@Component({
  imports: [HasPermissionDirective, LazyDropdownComponent],
  selector: 'app-users',
  styleUrl: './users.component.css',
  templateUrl: './users.component.html',
})
export class UsersComponent {
  readonly language = inject(AuthService).language;
  private readonly api = inject(Userservices);
  private readonly auth = inject(AuthService);
  private readonly rolesApi = inject(RolesService);
  private readonly dropdowns = inject(DropDownServices);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private inviteOpenedFromUrl = false;

  readonly inviteOpen = signal(false);
  readonly editingUserId = signal<string | null>(null);
  readonly editingUser = signal<User | null>(null);
  readonly editLoading = signal(false);
  readonly reinviteSubmitting = signal(false);
  readonly revokingSessionIds = signal<ReadonlySet<string>>(new Set());
  readonly inviteTab = signal<'account' | 'permissions' | 'locations'>('account');
  readonly fullName = signal('');
  readonly email = signal('');
  readonly phone = signal('');
  readonly roleId = signal('');
  private readonly originalRoleIds = signal<string[]>([]);
  readonly inviteSubmitting = signal(false);
  readonly inviteError = signal<string | null>(null);
  readonly pickedBusinessId = signal('');
  readonly pickedLocationBusinessId = signal('');
  readonly pickedLocationId = signal('');
  readonly businessSearch = signal('');
  readonly accessLocationLevels = signal<DropdownItem[][]>([[]]);
  readonly accessLocationSelectedIds = signal<string[]>([]);
  readonly accessLocationLoading = signal<Record<number, boolean>>({});
  private readonly accessLocationRequests: Record<number, Subscription> = {};
  private readonly selectedPermissions = signal<ReadonlySet<string>>(new Set());
  private readonly inheritedRoleClaims = signal<Claim[]>([]);
  private readonly businessAccess = signal<DropdownItem[]>([]);
  private readonly locationAccess = signal<DropdownItem[]>([]);
  readonly grantedBusinesses = this.businessAccess.asReadonly();
  readonly grantedLocations = this.locationAccess.asReadonly();
  readonly businessDropdownOptions = computed<LazyDropdownOption[]>(() =>
    (this.businessOptions.value() ?? []).map((item) => ({ id: item.id, name: item.name })),
  );
  readonly locationBusinessDropdownOptions = computed<LazyDropdownOption[]>(() =>
    this.grantedBusinesses().map((item) => ({ id: item.id, name: item.name })),
  );
  readonly locationDropdownOptions = (level: number): LazyDropdownOption[] =>
    (this.accessLocationLevels()[level] ?? []).map((item) => ({
      id: item.id,
      name: item.title ?? item.name,
    }));
  readonly allPermissionsResource = rxResource<AllPermissionsModule[], object | undefined>({
    params: () => (this.inviteOpen() ? {} : undefined),
    stream: () =>
      this.rolesApi
        .getAllPermissions()
        .pipe(map((response) => (Array.isArray(response?.data) ? response.data : []))),
  });
  readonly matrix = computed<PermissionRow[]>(() =>
    (this.allPermissionsResource.value() ?? [])
      .map((module) => {
        const moduleLabel = MODULE_LABELS[module.moduleName] ?? displayName(module.moduleName);
        const cells = CRUD_ACTIONS.map((action) => {
          const permission = module.permissions.find((name) => name.endsWith(`.${action}`));
          return permission ? { permission, label: `${moduleLabel} ${action}` } : null;
        });

        return { module: moduleLabel, cells };
      })
      .filter((row) => row.cells.some(Boolean)),
  );
  readonly extraSwitches = computed<ExtraPermission[]>(() =>
    (this.allPermissionsResource.value() ?? []).flatMap((module) => {
      const moduleLabel = MODULE_LABELS[module.moduleName] ?? displayName(module.moduleName);
      return module.permissions
        .filter((name) => !CRUD_ACTIONS.some((action) => name.endsWith(`.${action}`)))
        .map((permission) => {
          const action = permission.split('.').at(-1) ?? permission;
          return { permission, label: `${moduleLabel} ${displayName(action)}` };
        });
    }),
  );

  readonly rolesResource = rxResource({
    params: () => (this.inviteOpen() ? {} : undefined),
    stream: () => this.rolesApi.getRoles().pipe(map((response) => response?.data ?? [])),
  });
  readonly roleClaimsResource = rxResource<Claim[], string | undefined>({
    params: () => (this.inviteOpen() && this.roleId() ? this.roleId() : undefined),
    stream: ({ params }) =>
      this.rolesApi.getRoleClaims(params!).pipe(
        map((response) => {
          const data = response?.data?.roleClaims ?? response?.data ?? [];
          return Array.isArray(data) ? data : [];
        }),
      ),
  });
  readonly businessOptions = rxResource({
    params: () => (this.inviteOpen() ? this.businessSearch().trim() : undefined),
    stream: ({ params }) =>
      this.dropdowns
        .businesses({ pageNumber: 1, pageSize: 1000, search: params })
        .pipe(map((response) => response.data.data)),
  });
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const shouldOpenInvite = params.get('add') === '1';
      if (shouldOpenInvite) {
        this.inviteOpenedFromUrl = true;
        this.openAdd();
      } else if (this.inviteOpenedFromUrl && this.inviteOpen()) {
        this.inviteOpenedFromUrl = false;
        this.closeInvite();
      }
    });

    effect(() => {
      const roleId = this.roleId();
      if (!roleId || this.roleClaimsResource.isLoading() || this.roleClaimsResource.error()) return;
      const claims = this.roleClaimsResource.value() ?? [];
      this.inheritedRoleClaims.set(claims);
    });
  }

  // ---------- Search / paging ----------
  readonly pageSizeOptions = [5, 10, 25, 50];
  readonly searchTerm = signal('');
  readonly pageSize = signal(10);

  private readonly debouncedSearch = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(600),
      map((term) => term.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  /** an empty box applies immediately */
  private readonly activeSearch = computed(() =>
    this.searchTerm().trim() ? this.debouncedSearch() : '',
  );

  /** resets itself to 1 whenever search or page size change */
  readonly currentPage = linkedSignal<{ search: string; size: number }, number>({
    source: () => ({ search: this.activeSearch(), size: this.pageSize() }),
    computation: () => 1,
  });

  // ---------- List ----------
  private readonly listResource = rxResource({
    params: () => ({
      pageNumber: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.activeSearch(),
    }),
    stream: ({ params }) => this.api.list(params),
  });

  private readonly page = computed(() =>
    this.listResource.hasValue() ? this.listResource.value() : null,
  );
  readonly items = computed<User[]>(() => this.page()?.data ?? []);
  readonly total = computed(() => this.page()?.totalCount ?? 0);
  readonly loading = computed(() => this.listResource.isLoading());
  readonly error = computed(() => (this.listResource.error() ? 'Could not load users.' : null));

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  readonly pageRange = computed(() => {
    const total = this.total();
    if (!total) return { from: 0, to: 0, total: 0 };
    const from = (this.currentPage() - 1) * this.pageSize() + 1;
    const to = Math.min(this.currentPage() * this.pageSize(), total);
    return { from, to, total };
  });

  // ---------- Details modal ----------
  readonly detailsUser = signal<User | null>(null);
  readonly showAllBusinessNames = signal(false);
  readonly showAllLocationNames = signal(false);
  readonly showAllEditBusinesses = signal(false);
  readonly showAllEditLocations = signal(false);
  readonly detailsResource = rxResource({
    params: () => this.detailsUser()?.id,
    stream: ({ params }) => this.api.getById(params).pipe(map((res) => res.data)),
  });

  reload(): void {
    this.listResource.reload();
  }

  // ---------- Paging ----------
  prevPage(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }

  // ---------- Status ----------
  readonly statusOptions = USER_STATUS_OPTIONS;
  readonly invitedStatus = UserStatus.Invited;
  readonly statusUpdating = signal(false);
  readonly statusError = signal<string | null>(null);

  statusClass(status: number): string {
    switch (status) {
      case UserStatus.Active:
        return 'border border-emerald-300 bg-emerald-50 text-emerald-700';
      case UserStatus.Invited:
        return 'border border-dashed border-sky-300 bg-sky-50 text-sky-700';
      case UserStatus.Suspended:
        return 'border border-rose-300 bg-rose-50 text-rose-700';
      default:
        return 'border border-inkText/15 bg-ink/5 text-inkText';
    }
  }

  /** picker buttons in the details modal: filled with the status colour when selected */
  statusPickClass(value: number, current: number): string {
    if (value === current) return this.statusClass(value) + ' ring-2 ring-offset-1 ring-current';
    switch (value) {
      case UserStatus.Active:
        return 'border border-inkText/15 text-inkText hover:bg-emerald-50 hover:border-emerald-300';
      case UserStatus.Invited:
        return 'border border-dashed border-inkText/20 text-inkText hover:bg-sky-50 hover:border-sky-300';
      case UserStatus.Suspended:
        return 'border border-inkText/15 text-inkText hover:bg-rose-50 hover:border-rose-300';
      default:
        return 'border border-inkText/15 text-inkText';
    }
  }

  changeStatus(user: User, newStatus: UserStatus): void {
    if (this.statusUpdating() || user.status === newStatus) return;

    this.statusUpdating.set(true);
    this.statusError.set(null);

    this.api
      .updateStatus(user.id, newStatus)
      .pipe(
        tap(() => {
          const label = this.statusOptions.find((o) => o.value === newStatus)?.label ?? '';
          toast.success('User status updated successfully');
          // Keep the details modal in sync only when it is already open for this user.
          if (this.detailsUser()?.id === user.id) {
            this.detailsUser.update((current) =>
              current ? { ...current, status: newStatus, statusLabel: label } : current,
            );
          }
          if (this.editingUser()?.id === user.id) {
            this.editingUser.update((current) =>
              current ? { ...current, status: newStatus, statusLabel: label } : current,
            );
          }
          this.reload();
        }),
        catchError((err) => {
          this.statusError.set(
            err?.error?.message ?? 'Could not update the status. Please try again.',
          );
          return EMPTY;
        }),
        finalize(() => this.statusUpdating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // ---------- Invite ----------
  openAdd(): void {
    this.editingUserId.set(null);
    this.editingUser.set(null);
    this.showAllEditBusinesses.set(false);
    this.showAllEditLocations.set(false);
    this.editLoading.set(false);
    this.inviteError.set(null);
    this.inviteTab.set('account');
    this.inviteOpen.set(true);
  }

  closeInvite(force = false): void {
    if ((this.inviteSubmitting() || this.reinviteSubmitting()) && !force) return;
    this.inviteOpen.set(false);
    this.editingUserId.set(null);
    this.editingUser.set(null);
    this.editLoading.set(false);
    if (this.route.snapshot.queryParamMap.has('add')) {
      this.inviteOpenedFromUrl = false;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { add: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    this.fullName.set('');
    this.email.set('');
    this.phone.set('');
    this.roleId.set('');
    this.originalRoleIds.set([]);
    this.inheritedRoleClaims.set([]);
    this.pickedBusinessId.set('');
    this.pickedLocationBusinessId.set('');
    this.pickedLocationId.set('');
    this.businessSearch.set('');
    Object.values(this.accessLocationRequests).forEach((request) => request.unsubscribe());
    this.accessLocationLevels.set([[]]);
    this.accessLocationSelectedIds.set([]);
    this.accessLocationLoading.set({});
    this.businessAccess.set([]);
    this.locationAccess.set([]);
    this.selectedPermissions.set(new Set());
    this.inviteError.set(null);
  }

  reinvite(): void {
    const user = this.editingUser();
    const email = this.email().trim();
    if (!user || user.status !== UserStatus.Invited || !email || this.reinviteSubmitting()) return;

    this.reinviteSubmitting.set(true);
    this.inviteError.set(null);
    this.auth
      .reinvite({ email, frontendRegisterUrl: `${window.location.origin}/register` })
      .pipe(
        tap(() => toast.success('Invitation email sent successfully')),
        catchError((error) => {
          this.inviteError.set(error?.error?.message ?? 'Could not resend the invitation. Please try again.');
          return EMPTY;
        }),
        finalize(() => this.reinviteSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  scrollInviteContent(event: WheelEvent, content: HTMLElement): void {
    if (event.deltaY === 0) return;

    event.preventDefault();
    content.scrollTop += event.deltaY;
  }

  onRoleChange(id: string): void {
    this.roleId.set(id);
    this.selectedPermissions.set(new Set());
    this.inheritedRoleClaims.set([]);
  }

  rowAllChecked(row: PermissionRow): boolean {
    return row.cells.filter(Boolean).every((cell) => !!cell && this.isChecked(cell.permission));
  }

  isLocked(name: string): boolean {
    return this.inheritedRoleClaims().some(
      (claim) => claim.permissionName === name && claim.hasPermission,
    );
  }

  isChecked(name: string): boolean {
    return this.isLocked(name) || this.selectedPermissions().has(name);
  }

  togglePermission(name: string): void {
    if (this.isLocked(name)) return;
    this.selectedPermissions.update((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  toggleRow(row: PermissionRow, checked: boolean): void {
    for (const cell of row.cells) {
      if (!cell || this.isLocked(cell.permission)) continue;
      this.selectedPermissions.update((current) => {
        const next = new Set(current);
        if (checked) next.add(cell.permission);
        else next.delete(cell.permission);
        return next;
      });
    }
  }

  addBusiness(): void {
    const business = this.businessOptions
      .value()
      ?.find((option) => option.id === this.pickedBusinessId());
    if (!business || this.businessAccess().some((item) => item.id === business.id)) return;
    this.businessAccess.update((items) => [...items, business]);
    this.pickedBusinessId.set('');
  }

  selectLocationBusiness(id: string): void {
    this.pickedLocationBusinessId.set(id);
    this.pickedLocationId.set('');
    Object.values(this.accessLocationRequests).forEach((request) => request.unsubscribe());
    this.accessLocationLevels.set([[]]);
    this.accessLocationSelectedIds.set([]);
    this.accessLocationLoading.set({});
    if (id) this.loadAccessLocationLevel(0, null);
  }

  loadAccessLocationLevel(level: number, parentId: string | null): void {
    const businessId = this.pickedLocationBusinessId();
    if (!businessId || this.accessLocationLoading()[level]) return;
    if (this.accessLocationLevels()[level]?.length) return;

    this.accessLocationLoading.update((state) => ({ ...state, [level]: true }));
    this.accessLocationRequests[level]?.unsubscribe();
    this.accessLocationRequests[level] = this.dropdowns
      .locations({ businessId, parentId, pageNumber: 1, pageSize: 1000, search: '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.accessLocationLevels.update((levels) => {
            const next = levels.slice(0, level);
            if (response.data.data.length || level === 0) next[level] = response.data.data;
            return next;
          });
          this.accessLocationLoading.update((state) => ({ ...state, [level]: false }));
        },
        error: () => this.accessLocationLoading.update((state) => ({ ...state, [level]: false })),
      });
  }

  selectAccessLocation(level: number, location: LazyDropdownOption): void {
    const id = String(location.id);
    this.accessLocationSelectedIds.update((selected) => {
      const next = selected.slice(0, level);
      next[level] = id;
      return next;
    });
    this.pickedLocationId.set(id);
    this.accessLocationLevels.update((levels) => levels.slice(0, level + 1));
    this.loadAccessLocationLevel(level + 1, id);
  }

  clearAccessLocation(level: number): void {
    this.accessLocationLevels.update((levels) => (level === 0 ? [[]] : levels.slice(0, level)));
    this.accessLocationSelectedIds.update((selected) => selected.slice(0, level));
    this.pickedLocationId.set(this.accessLocationSelectedIds().at(-1) ?? '');
  }

  removeBusiness(id: string): void {
    this.businessAccess.update((items) => items.filter((item) => item.id !== id));
    this.locationAccess.set([]);
    if (this.pickedLocationBusinessId() === id) {
      this.pickedLocationBusinessId.set('');
      this.pickedLocationId.set('');
    }
  }

  addLocation(): void {
    const location = this.accessLocationLevels()
      .flat()
      .find((option) => String(option.id) === this.pickedLocationId());
    if (!location || this.locationAccess().some((item) => item.id === location.id)) return;
    this.locationAccess.update((items) => [...items, location]);
    this.pickedLocationId.set('');
  }

  removeLocation(id: string): void {
    this.locationAccess.update((items) => items.filter((item) => item.id !== id));
  }

  submitInvite(): void {
    if (this.inviteSubmitting() || this.editLoading()) return;
    const fullName = this.fullName().trim();
    const email = this.email().trim();
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !this.roleId()) {
      this.inviteError.set('Enter a name, a valid email address, and select a role.');
      this.inviteTab.set('account');
      return;
    }

    const payload: InviteUserRequest = {
      fullName,
      email,
      phone: this.phone().trim(),
      roleIds: [this.roleId()],
      userClaims: [
        ...new Set([
          ...this.selectedPermissions(),
          ...this.inheritedRoleClaims()
            .filter((claim) => claim.hasPermission)
            .map((claim) => claim.permissionName),
        ]),
      ],
      businessIds: this.businessAccess().map((business) => String(business.id)),
      locationIds: this.locationAccess().map((location) => String(location.id)),
      frontendRegisterUrl: `${window.location.origin}/register`,
    };

    const editingUserId = this.editingUserId();
    if (editingUserId) {
      const originalRoleIds = this.originalRoleIds();
      const roleIds = originalRoleIds[0] === this.roleId() ? originalRoleIds : [this.roleId()];
      const updatePayload: UpdateUserRequest = {
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        roleIds,
        permissions: payload.userClaims,
        businessIds: payload.businessIds,
        locationIds: payload.locationIds,
        frontendRegisterUrl: payload.frontendRegisterUrl,
      };

      this.inviteSubmitting.set(true);
      this.inviteError.set(null);
      this.api
        .updateUser(editingUserId, updatePayload)
        .pipe(
          tap(() => {
            toast.success('User updated successfully');
            this.closeInvite(true);
            this.reload();
          }),
          catchError((error) => {
            this.inviteError.set(
              error?.error?.message ?? 'Could not update the user. Please try again.',
            );
            return EMPTY;
          }),
          finalize(() => this.inviteSubmitting.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe();
      return;
    }

    this.inviteSubmitting.set(true);
    this.inviteError.set(null);
    this.auth
      .invite(payload)
      .pipe(
        tap(() => {
          toast.success('Invitation sent successfully');
          this.closeInvite(true);
          this.reload();
        }),
        catchError((error) => {
          this.inviteError.set(
            error?.error?.message ?? 'Could not send the invitation. Please try again.',
          );
          return EMPTY;
        }),
        finalize(() => this.inviteSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  openEdit(user: User): void {
    this.editingUserId.set(user.id);
    this.editingUser.set(user);
    this.showAllEditBusinesses.set(false);
    this.showAllEditLocations.set(false);
    this.editLoading.set(true);
    this.inviteOpen.set(true);
    this.inviteTab.set('account');
    this.inviteError.set(null);
    this.fullName.set(user.fullName);
    this.email.set(user.email);
    this.phone.set(user.phone ?? '');
    this.roleId.set('');
    this.originalRoleIds.set([]);
    this.selectedPermissions.set(new Set());
    this.inheritedRoleClaims.set([]);
    this.businessAccess.set([]);
    this.locationAccess.set([]);

    forkJoin({
      detail: this.api.getById(user.id),
      roles: this.rolesApi.getUserRoles(user.id),
      claims: this.rolesApi.getUserClaims(user.id),
      roleOptions: this.rolesApi.getRoles().pipe(catchError(() => of({ data: [] }))),
      businesses: this.dropdowns
        .businesses({ pageNumber: 1, pageSize: 1000, search: '' })
        .pipe(catchError(() => of({ data: { data: [] } }))),
    })
      .pipe(
        finalize(() => this.editLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ detail, roles, claims, roleOptions, businesses }) => {
          const details = detail?.data;
          if (!details) {
            this.inviteError.set('Could not load this user. Please try again.');
            return;
          }

          this.fullName.set(details.fullName ?? user.fullName);
          this.email.set(details.email ?? user.email);
          this.phone.set(details.phone ?? user.phone ?? '');

          const roleList = Array.isArray(roleOptions?.data) ? roleOptions.data : [];
          const assignedRoleData = roles?.data?.roleIds ?? roles?.data?.roles ?? roles?.data ?? [];
          let roleIds = this.normalizeIds(assignedRoleData);
          if (!roleIds.length) {
            const assignedNames = details.roles ?? user.roles;
            roleIds = roleList
              .filter((option: any) => assignedNames.includes(option.name ?? option.roleName))
              .map((option: any) => String(option.id ?? option.roleId));
          }
          this.originalRoleIds.set(roleIds);
          this.roleId.set(roleIds[0] ?? '');

          const claimData =
            claims?.data?.userClaims ??
            claims?.data?.permissions ??
            claims?.data?.claims ??
            claims?.data ??
            details.claims ??
            [];
          this.selectedPermissions.set(new Set(this.normalizePermissionNames(claimData)));

          const businessList = businesses?.data?.data ?? [];
          const businessIds = (details.businessIds ?? []).map(String);
          const businessNames = details.businessNames ?? [];
          const locationNames = details.locationNames ?? [];
          this.businessAccess.set(
            businessIds.map((id, index) => ({
              id,
              name:
                businessNames[index] ??
                businessList.find((item: DropdownItem) => String(item.id) === id)?.name ??
                id,
            })),
          );
          this.locationAccess.set(
            (details.locationIds ?? []).map((id, index) => ({
              id: String(id),
              name: locationNames[index] ?? String(id),
            })),
          );
          const firstBusinessId = businessIds[0] ?? '';
          this.pickedLocationBusinessId.set(firstBusinessId);
        },
        error: (error) => {
          this.inviteError.set(
            error?.error?.message ?? 'Could not load this user. Please try again.',
          );
        },
      });
  }

  private normalizeIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) =>
        typeof item === 'string' || typeof item === 'number'
          ? String(item)
          : String(item?.id ?? item?.roleId ?? ''),
      )
      .filter(Boolean);
  }

  private normalizePermissionNames(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((claim) =>
        typeof claim === 'string' ? claim : (claim?.permissionName ?? claim?.name ?? ''),
      )
      .filter((name) => typeof name === 'string' && !!name);
  }

  suspendUser(event: MouseEvent, user: User): void {
    event.stopPropagation();
    this.changeStatus(user, UserStatus.Suspended);
  }

  revokeUserSessions(event: MouseEvent, user: User): void {
    event.stopPropagation();
    if (this.revokingSessionIds().has(user.id)) return;

    this.revokingSessionIds.update((ids) => new Set(ids).add(user.id));
    this.auth
      .revokeAllSessions(user.id)
      .pipe(
        tap(() => toast.success(`Sessions ended for ${user.fullName}`)),
        catchError((error) => {
          toast.error(error?.error?.message ?? 'Could not end this user’s sessions. Please try again.');
          return EMPTY;
        }),
        finalize(() =>
          this.revokingSessionIds.update((ids) => {
            const next = new Set(ids);
            next.delete(user.id);
            return next;
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // ---------- Details ----------
  openDetails(user: User): void {
    this.statusError.set(null);
    this.showAllBusinessNames.set(false);
    this.showAllLocationNames.set(false);
    this.detailsUser.set(user);
  }

  closeDetails(): void {
    this.detailsUser.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.detailsUser()) this.closeDetails();
  }
}
