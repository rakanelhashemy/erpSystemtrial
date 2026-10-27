import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, HostListener, inject, Injector, signal } from '@angular/core';
import { GroupService } from '../../core/services/group-service';
import { Group } from '../../core/models/group-modal';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, tap, switchMap, catchError, EMPTY, debounceTime } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { GroupModalComponent } from './group-modal/group-modal.component';
import { toast } from 'ngx-sonner';
import { BusinessContextService } from '../../core/services/business-context.service';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

@Component({
  imports: [FormsModule, GroupModalComponent, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-groups',
  styleUrl: './groups.component.css',
  templateUrl: './groups.component.html',
})
export class GroupsComponent {
   private readonly api = inject(GroupService);
  private readonly destroyRef = inject(DestroyRef);

  // ---------- List state ----------
  readonly items = signal<Group[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // ---------- Filters ----------
  readonly searchTerm = signal('');
  readonly pageSize = signal(10);
  readonly currentPage = signal(1);

  // ---------- Navigation ----------
  readonly breadcrumb = signal<Group[]>([]);
  readonly currentGroup = computed(() => this.breadcrumb().at(-1) ?? null);

  // ---------- Derived ----------
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  readonly pageRange = computed(() => {
    const total = this.total();
    if (!total) return { from: 0, to: 0, total: 0 };
    const from = (this.currentPage() - 1) * this.pageSize() + 1;
    const to = Math.min(this.currentPage() * this.pageSize(), total);
    return { from, to, total };
  });

  // ---------- Add / Edit modal ----------
  readonly modalOpen = signal(false);
  readonly modalGroup = signal<Group | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  // ---------- Delete modal ----------
  readonly deleteTarget = signal<Group | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  // ---------- Details modal ----------
  readonly detailsOpen = signal(false);
  readonly detailsGroup = signal<Group | null>(null);
  readonly detailsLoading = signal(false);
  readonly detailsError = signal<string | null>(null);
  private detailsRequestId = 0;
  private lastDetailsId: string | null = null;

  // ---------- Request pipeline (switchMap cancels the old request) ----------
  private readonly reload$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  ngOnInit(): void {
    this.reload$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(() =>
          this.api
            .list({
              pageNumber: this.currentPage(),
              pageSize: this.pageSize(),
              search: this.searchTerm(),
              parentId: this.currentGroup()?.id ?? null,
            })
            .pipe(
              catchError(() => {
                this.error.set('Could not load groups.');
                this.loading.set(false);
                return EMPTY;
              })
            )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        this.items.set(res.data?.data ?? []);
        this.total.set(res.data?.totalCount ?? 0);
        this.loading.set(false);
      });

    this.search$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.currentPage.set(1);
        this.load();
      });

    this.load();
  }

  load(): void {
    this.reload$.next();
  }

  // ---------- Navigation ----------
  openChild(group: Group): void {
    this.breadcrumb.update((path) => [...path, group]);
    this.resetFilters();
    this.load();
  }

  /** null = top level */
  goToBreadcrumb(id: string | null): void {
    if (id === null) {
      this.breadcrumb.set([]);
    } else {
      const index = this.breadcrumb().findIndex((g) => g.id === id);
      if (index === -1) return;
      this.breadcrumb.update((path) => path.slice(0, index + 1));
    }
    this.resetFilters();
    this.load();
  }

  private resetFilters(): void {
    this.searchTerm.set('');
    this.currentPage.set(1);
  }

  // ---------- Filters / paging ----------
  setSearchTerm(term: string): void {
    this.searchTerm.set(term ?? '');
    this.search$.next(this.searchTerm());
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.load();
  }

  prevPage(): void {
    if (this.currentPage() <= 1) return;
    this.currentPage.update((p) => p - 1);
    this.load();
  }

  nextPage(): void {
    if (this.currentPage() >= this.totalPages()) return;
    this.currentPage.update((p) => p + 1);
    this.load();
  }

  // ---------- Add / Edit ----------
  openAdd(): void {
    this.modalGroup.set(null);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(group: Group): void {
    this.modalGroup.set(group);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.modalGroup.set(null);
    this.saveError.set(null);
  }

  onSaved(result: { name: string }): void {
    const name = result.name.trim();
    if (!name || this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const edited = this.modalGroup();
    // كل العناصر المعروضة أولاد المستوى الحالي
    const parentId = this.currentGroup()?.id ?? null;

    const request$ = edited
      ? this.api.update(edited.id, { name, parentId })
      : this.api.create({ name, parentId });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        // keep the breadcrumb in sync if the renamed group is part of the path
        if (edited) {
          this.breadcrumb.update((path) =>
            path.map((g) => (g.id === edited.id ? { ...g, name } : g))
          );
        }
        this.closeModal();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'Could not save the group. Please try again.');
      },
    });
  }

  // ---------- Delete ----------
  openDelete(group: Group): void {
    this.deleteTarget.set(group);
    this.deleteError.set(null);
  }

  closeDelete(): void {
    this.deleteTarget.set(null);
    this.deleteError.set(null);
  }

  /** ignores cancel while the request is running */
  cancelDelete(): void {
    if (!this.deleting()) this.closeDelete();
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    this.api.delete(target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.closeDelete();
        // if it was the last item on the page, go back one page
        if (this.items().length === 1 && this.currentPage() > 1) {
          this.currentPage.update((p) => p - 1);
        }
        this.load();
      },
      error: (err) => {
        this.deleting.set(false);
        this.deleteError.set(
          err?.error?.message ?? 'Could not delete this group. It may be linked to items.'
        );
      },
    });
  }

  // ---------- Details ----------
  openDetails(group: Group): void {
    this.detailsGroup.set(null);
    this.detailsOpen.set(true);
    this.fetchDetails(group.id);
  }

  fetchDetails(id: string): void {
    this.lastDetailsId = id;
    const requestId = ++this.detailsRequestId;
    this.detailsLoading.set(true);
    this.detailsError.set(null);

    this.api.getById(id).subscribe({
      next: (res) => {
        if (requestId !== this.detailsRequestId) return; // ignore stale response
        this.detailsGroup.set(res.data ?? null);
        if (!res.data) this.detailsError.set('Group not found.');
        this.detailsLoading.set(false);
      },
      error: (err) => {
        if (requestId !== this.detailsRequestId) return;
        this.detailsError.set(err?.error?.message ?? 'Could not load group details.');
        this.detailsLoading.set(false);
      },
    });
  }

  retryDetails(): void {
    if (this.lastDetailsId) this.fetchDetails(this.lastDetailsId);
  }

  closeDetails(): void {
    this.detailsRequestId++; // cancels any pending response
    this.detailsOpen.set(false);
    this.detailsGroup.set(null);
    this.detailsError.set(null);
    this.detailsLoading.set(false);
  }

  // ---------- Escape ----------
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.detailsOpen()) this.closeDetails();
    else if (this.deleteTarget()) this.cancelDelete();
  }
}
