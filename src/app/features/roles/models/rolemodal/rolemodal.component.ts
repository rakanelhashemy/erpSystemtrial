import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, forkJoin, of, switchMap, throwError } from 'rxjs';
import { toast } from 'ngx-sonner';
import { Claim, RolesService } from '../../../../core/services/roles-service';

interface PermissionModule {
  moduleName: string;
  label: string;
  permissions: string[];
  crudPermissions: Partial<Record<(typeof CRUD_ACTIONS)[number], string>>;
}

const CRUD_ACTIONS = ['View', 'Add', 'Edit', 'Delete'] as const;
const MODULE_LABELS: Record<string, string> = {
  LocationTypes: 'Location Types',
  MaintenanceCompanies: 'Maintenance Companies',
  CheckLists: 'Check Lists',
};

const displayName = (value: string): string =>
  value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());

@Component({
  selector: 'app-rolemodal',
  imports: [ReactiveFormsModule],
  templateUrl: './rolemodal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeModal()' },
})
export class RolemodalComponent implements OnInit {
  private readonly rolesService = inject(RolesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly saved = output<void>();
  readonly close = output<void>();
  readonly roleId = input<string | null>(null);
  readonly isEdit = computed(() => !!this.roleId());

  readonly crudActions = CRUD_ACTIONS;

  readonly roleName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)], // rejects whitespace-only
  });

  readonly loading = signal(false);
  readonly permissionsLoading = signal(false);
  readonly permissionsError = signal('');
  readonly saving = signal(false);
  readonly errorMsg = signal('');

  private readonly permissionGroups = signal<PermissionModule[]>([]);
  private readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectedCount = computed(() => this.selected().size);
  readonly modules = computed(() =>
    this.permissionGroups().filter((module) =>
      CRUD_ACTIONS.some((action) => module.crudPermissions[action]),
    ),
  );
  readonly extraPermissions = computed(() =>
    this.permissionGroups().flatMap((module) =>
      module.permissions
        .filter((permission) => !CRUD_ACTIONS.some((action) => permission.endsWith(`.${action}`)))
        .map((permission) => {
          const action = permission.split('.').at(-1) ?? permission;
          return { permission, label: `${module.label} ${displayName(action)}` };
        }),
    ),
  );
  readonly allPermissions = computed(() =>
    this.permissionGroups().flatMap((module) => module.permissions),
  );

  ngOnInit(): void {
    this.loadPermissions();
    const id = this.roleId();
    if (id) this.getRoleInfo(id);
  }

  rowPermissions(module: PermissionModule): string[] {
    return module.permissions;
  }

  columnPermissions(action: (typeof CRUD_ACTIONS)[number]): string[] {
    return this.modules()
      .map((module) => module.crudPermissions[action])
      .filter((permission): permission is string => !!permission);
  }

  permissionFor(module: PermissionModule, action: (typeof CRUD_ACTIONS)[number]): string | null {
    return module.crudPermissions[action] ?? null;
  }

  /** Are all of these permissions checked? */
  isAllSelected(perms: string[]): boolean {
    const selected = this.selected();
    return perms.length > 0 && perms.every((p) => selected.has(p));
  }

  isPartiallySelected(perms: string[]): boolean {
    const selected = this.selected();
    const count = perms.filter((p) => selected.has(p)).length;
    return count > 0 && count < perms.length;
  }

  rowAllSelected(module: PermissionModule): boolean {
    return this.isAllSelected(module.permissions);
  }

  rowPartiallySelected(module: PermissionModule): boolean {
    return this.isPartiallySelected(module.permissions);
  }

  /** Check / uncheck a group of permissions at once */
  onToggleMany(perms: string[], checkedOrEvent: boolean | Event): void {
    const checked =
      typeof checkedOrEvent === 'boolean'
        ? checkedOrEvent
        : (checkedOrEvent.target as HTMLInputElement).checked;
    this.selected.update((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  }

  isSelected(permission: string): boolean {
    return this.selected().has(permission);
  }

  onPermissionChange(permission: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.update((prev) => {
      const next = new Set(prev);
      if (checked) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  private buildClaims(): Claim[] {
    const selected = this.selected();
    return this.allPermissions().map((permissionName) => ({
      permissionName,
      hasPermission: selected.has(permissionName),
    }));
  }

  loadPermissions(): void {
    this.permissionsLoading.set(true);
    this.permissionsError.set('');
    this.rolesService
      .getAllPermissions()
      .pipe(
        finalize(() => this.permissionsLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          const permissions = Array.isArray(response?.data) ? response.data : [];
          this.permissionGroups.set(
            permissions.map((module) => ({
              moduleName: module.moduleName,
              label: MODULE_LABELS[module.moduleName] ?? displayName(module.moduleName),
              permissions: module.permissions ?? [],
              crudPermissions: Object.fromEntries(
                CRUD_ACTIONS.flatMap((action) => {
                  const permission = module.permissions?.find((name) =>
                    name.endsWith(`.${action}`),
                  );
                  return permission ? [[action, permission]] : [];
                }),
              ),
            })),
          );
        },
        error: (error) => {
          this.permissionsError.set(error?.error?.message ?? 'Failed to load permissions.');
        },
      });
  }

  save(): void {
    if (this.saving() || this.loading() || this.permissionsLoading() || this.permissionsError())
      return;

    if (this.roleName.invalid) {
      this.roleName.markAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMsg.set('');

    const name = this.roleName.value.trim();
    const id = this.roleId();
    const request$ = id ? this.update(id, name) : this.create(name);

    request$
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          toast.success(id ? 'Role updated successfully' : 'Role created successfully');
          this.saved.emit();
          this.close.emit();
        },
        error: (err) => {
          console.error(err);
          this.errorMsg.set('Something went wrong while saving the role.');
          toast.error(id ? 'Could not update role' : 'Could not create role');
        },
      });
  }

  private create(name: string) {
    return this.rolesService.createRole(name).pipe(
      switchMap((res) => {
        const roleId = res.data;
        if (!roleId) {
          return throwError(() => new Error('roleId not found in create-role response'));
        }

        return this.rolesService.updateRoleClaims({ roleId, roleClaims: this.buildClaims() }).pipe(
          // Rollback: if claims fail, delete the role that was just created
          catchError((err) =>
            this.rolesService.deleteRole(roleId).pipe(
              catchError(() => of(null)), // must emit so the next switchMap runs
              switchMap(() => throwError(() => err)),
            ),
          ),
        );
      }),
    );
  }

  private update(roleId: string, roleName: string) {
    return this.rolesService
      .editRole({ roleId, roleName })
      .pipe(
        switchMap(() =>
          this.rolesService.updateRoleClaims({ roleId, roleClaims: this.buildClaims() }),
        ),
      );
  }

  private getRoleInfo(roleId: string): void {
    this.loading.set(true);
    this.errorMsg.set('');

    forkJoin({
      role: this.rolesService.getRoleById(roleId),
      claims: this.rolesService.getRoleClaims(roleId),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ role, claims }) => {
          const roleData = role.data;
          if (!roleData) {
            this.errorMsg.set('Role not found.');
            return;
          }

          this.roleName.setValue(roleData.name);

          const list = (claims.data?.roleClaims ?? claims.data ?? []) as Claim[];
          this.selected.set(
            new Set(list.filter((c) => c.hasPermission).map((c) => c.permissionName)),
          );
        },
        error: (err) => {
          console.error(err);
          this.errorMsg.set('Failed to load role.');
        },
      });
  }

  closeModal(): void {
    if (this.saving()) return; // don't close while saving
    this.close.emit();
  }
}
