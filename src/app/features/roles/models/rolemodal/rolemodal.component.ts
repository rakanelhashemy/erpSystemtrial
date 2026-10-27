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
  key: string;       // Permissions.<key>.<action>
  label: string;     // display name
  actions: string[]; // actions available for the module
}

const CRUD_ACTIONS = ['View', 'Add', 'Edit', 'Delete'];

const MODULES: PermissionModule[] = [
  { key: 'Roles', label: 'Roles', actions: CRUD_ACTIONS },
  { key: 'Users', label: 'Users', actions: CRUD_ACTIONS },
  { key: 'Businesses', label: 'Businesses', actions: CRUD_ACTIONS },
  { key: 'Locations', label: 'Locations', actions: CRUD_ACTIONS },
  { key: 'LocationTypes', label: 'Location Types', actions: CRUD_ACTIONS },
  { key: 'Groups', label: 'Groups', actions: CRUD_ACTIONS },
  { key: 'Items', label: 'Items', actions: CRUD_ACTIONS },
  { key: 'Departments', label: 'Departments', actions: CRUD_ACTIONS },
  { key: 'Suppliers', label: 'Suppliers', actions: CRUD_ACTIONS },
  { key: 'MaintenanceCompanies', label: 'Maintenance Companies', actions: CRUD_ACTIONS },
  { key: 'Employees', label: 'Employees', actions: CRUD_ACTIONS },
  { key: 'CheckLists', label: 'Check Lists', actions: CRUD_ACTIONS },
  { key: 'Transactions', label: 'Transactions', actions: CRUD_ACTIONS },
  { key: 'Printing', label: 'Printing', actions: ['View'] },
  { key: 'Reports', label: 'Reports', actions: ['View'] },
  { key: 'Security', label: 'Security', actions: ['RevokeSessions'] },
];

const permissionName = (moduleKey: string, action: string) => `Permissions.${moduleKey}.${action}`;

// Computed once instead of on every change detection
const MODULE_PERMISSIONS = new Map(
  MODULES.map((m) => [m.key, m.actions.map((a) => permissionName(m.key, a))] as const),
);
const COLUMN_PERMISSIONS = new Map(
  CRUD_ACTIONS.map((a) => [
    a,
    MODULES.filter((m) => m.actions.includes(a)).map((m) => permissionName(m.key, a)),
  ] as const),
);
const ALL_PERMISSIONS = [...MODULE_PERMISSIONS.values()].flat();

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
  readonly modules = MODULES;
  readonly allPermissions = ALL_PERMISSIONS;

  readonly roleName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/\S/)], // rejects whitespace-only
  });

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMsg = signal('');

  private readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectedCount = computed(() => this.selected().size);

  ngOnInit(): void {
    const id = this.roleId();
    if (id) this.getRoleInfo(id);
  }

  permissionName(moduleKey: string, action: string): string {
    return permissionName(moduleKey, action);
  }

  rowPermissions(m: PermissionModule): string[] {
    return MODULE_PERMISSIONS.get(m.key) ?? [];
  }

  columnPermissions(action: string): string[] {
    return COLUMN_PERMISSIONS.get(action) ?? [];
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

  /** Check / uncheck a group of permissions at once */
  onToggleMany(perms: string[], event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.update((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (checked) next.add(p);
        else next.delete(p);
      }
      return next;
    });
  }

  hasAction(m: PermissionModule, action: string): boolean {
    return m.actions.includes(action);
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
    return this.modules.flatMap((m) =>
      m.actions.map((a) => {
        const name = this.permissionName(m.key, a);
        return { permissionName: name, hasPermission: selected.has(name) };
      }),
    );
  }

  save(): void {
    if (this.saving() || this.loading()) return;

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
    return this.rolesService.editRole({ roleId, roleName }).pipe(
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
