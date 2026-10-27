import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RolesService } from '../../core/services/roles-service';
import { RolemodalComponent } from './models/rolemodal/rolemodal.component';
import { toast } from 'ngx-sonner';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

interface Role {
  id: string;
  name: string;
}

@Component({
  selector: 'app-roles',
  imports: [RolemodalComponent, HasPermissionDirective],
  templateUrl: './roles.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesComponent implements OnInit {
   private readonly rolesService = inject(RolesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly roles = signal<Role[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');

  // Add / edit modal
  protected readonly isModalOpen = signal(false);
  protected readonly editRoleId = signal<string | null>(null);

  // Delete modal
  protected readonly isDeleteModalOpen = signal(false);
  protected readonly roleToDelete = signal<Role | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');

  ngOnInit(): void {
    this.loadRoles();
  }

  protected loadRoles(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.rolesService
      .getRoles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.roles.set(res.data);
          this.loading.set(false);
        },
        error: (err) => {
          this.loadError.set(err?.error?.message ?? 'Failed to load roles');
          this.loading.set(false);
        },
      });
  }

  protected openModal(): void {
    this.editRoleId.set(null); // create mode
    this.isModalOpen.set(true);
  }

  protected openEditModal(roleid: string): void {
    this.editRoleId.set(roleid); 
    this.isModalOpen.set(true);
  }

  protected closeModal(): void {
    this.isModalOpen.set(false);
    this.editRoleId.set(null);
    this.loadRoles();
  }

  protected openDeleteModal(role: Role): void {
    this.deleteError.set('');
    this.roleToDelete.set(role);
    this.isDeleteModalOpen.set(true);
  }

  protected closeDeleteModal(): void {
    this.deleting.set(false);
    this.isDeleteModalOpen.set(false);
    this.roleToDelete.set(null);
  }

  protected confirmDelete(): void {
    const role = this.roleToDelete();
    if (!role) return;

    this.deleting.set(true);
    this.deleteError.set('');

    this.rolesService
      .deleteRole(role.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.roles.update((list) => list.filter((r) => r.id !== role.id));
          this.closeDeleteModal();
          toast.success('Role deleted successfully');
        },
        error: (e) => {
          this.deleting.set(false);
          this.deleteError.set(e?.error?.message || e?.message || 'Failed to delete role');
          toast.error('Could not delete role');
        },
      });
  }
}
