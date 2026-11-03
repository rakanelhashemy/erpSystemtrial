import { Component, computed, DestroyRef, HostListener, inject, linkedSignal, signal } from '@angular/core';
import { toSignal, toObservable, rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, map, distinctUntilChanged, catchError, EMPTY, finalize, tap } from 'rxjs';
import { User, USER_STATUS_OPTIONS, UserStatus } from '../../core/models/user-modal';
import { Userservices } from '../../core/services/userservices';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { toast } from 'ngx-sonner';

@Component({
  imports: [HasPermissionDirective],
  selector: 'app-users',
  styleUrl: './users.component.css',
  templateUrl: './users.component.html',
})
export class UsersComponent {
  private readonly api = inject(Userservices);
  private readonly destroyRef = inject(DestroyRef);
 
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
  readonly error = computed(() =>
    this.listResource.error() ? 'Could not load users.' : null,
  );
 
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
          this.reload();
        }),
        catchError((err) => {
          this.statusError.set(err?.error?.message ?? 'Could not update the status. Please try again.');
          return EMPTY;
        }),
        finalize(() => this.statusUpdating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
 
  // ---------- Add / Edit / Delete (UI hooks, wire up once the endpoints are shared) ----------
  openAdd(): void {
    // TODO: open the add-user modal
  }
 
  openEdit(_user: User): void {
    // TODO: open the edit-user modal
  }
 
  suspendUser(event: MouseEvent, user: User): void {
    event.stopPropagation();
    this.changeStatus(user, UserStatus.Suspended);
  }
 
  // ---------- Details ----------
  openDetails(user: User): void {
    this.statusError.set(null);
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
