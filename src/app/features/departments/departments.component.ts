import { Component, computed, DestroyRef, effect, HostListener, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, debounceTime, distinctUntilChanged, finalize, map, tap } from 'rxjs';
import { Department, DepartmentRequest } from '../../core/models/depatment-modal';

import { DepartmentService } from '../../core/services/depatment-service';
import { DepartmentModalComponent } from './department-modal/department-modal.component';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
const SEARCH_DEBOUNCE_MS = 300;
const NO_ITEMS: Department[] = [];
@Component({
  imports: [DepartmentModalComponent, HasPermissionDirective],
  selector: 'app-departments',
  styleUrl: './departments.component.css',
  templateUrl: './departments.component.html',
})
export class DepartmentsComponent {

  private readonly api = inject(DepartmentService);
  private readonly destroyRef = inject(DestroyRef);
  
 
  // ---------- Navigation ----------
  readonly breadcrumb = signal<Department[]>([]);
  readonly currentDepartment = computed(() => this.breadcrumb().at(-1) ?? null);
 
  // ---------- Filters ----------
  readonly pageSizeOptions = [5, 10, 25, 50];
  readonly searchTerm = signal('');
  readonly pageSize = signal(10);
 
  /** searchTerm after a 300ms pause */
  private readonly debouncedSearch = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(300),
      map((term) => term.trim()),
      distinctUntilChanged()
    ),
    { initialValue: '' }
  );
 
  /** what actually drives the request: an empty box applies immediately, no waiting */
  private readonly activeSearch = computed(() => (this.searchTerm().trim() ? this.debouncedSearch() : ''));
 
  /** resets itself to 1 whenever the search, the page size or the level changes */
  readonly currentPage = linkedSignal<{ search: string; size: number; parent: string | null }, number>({
    source: () => ({
      search: this.activeSearch(),
      size: this.pageSize(),
      parent: this.currentDepartment()?.id ?? null,
    }),
    computation: () => 1,
  });
 
  // ---------- List (re-fetches by itself when any signal in params changes) ----------
  private readonly listResource = rxResource({
    params: () => ({
      pageNumber: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.activeSearch(),
      parentId: this.currentDepartment()?.id ?? null,
    }),
    stream: ({ params }) => this.api.list(params).pipe(map((res) => res.data)),
  });
 
  private readonly page = computed(() => (this.listResource.hasValue() ? this.listResource.value() : null));
  readonly items = computed<Department[]>(() => this.page()?.data ?? []);
  readonly total = computed(() => this.page()?.totalCount ?? 0);
  readonly loading = computed(() => this.listResource.isLoading());
  readonly error = computed(() =>
    this.listResource.error() ? 'Could not load departments.' : null
  );
 
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
  readonly modalDepartment = signal<Department | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
 
  // ---------- Delete modal ----------
  readonly deleteTarget = signal<Department | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
 
  // ---------- Details modal ----------
  /** set from the list row, so the modal opens instantly with title + code */
  readonly detailsDepartment = signal<Department | null>(null);
 
  /** loads the rest (created/updated by) while the modal is already visible */
  readonly detailsResource = rxResource({
    params: () => this.detailsDepartment()?.id,
    stream: ({ params }) => this.api.getById(params).pipe(map((res) => res.data)),
  });
 
  reload(): void {
    this.listResource.reload();
  }
 
  // ---------- Navigation ----------
  openChild(department: Department): void {
    this.breadcrumb.update((path) => [...path, department]);
    this.resetSearch();
  }
 
  /** null = top level */
  goToBreadcrumb(id: string | null): void {
    if (id === null) {
      this.breadcrumb.set([]);
    } else {
      const index = this.breadcrumb().findIndex((d) => d.id === id);
      if (index === -1) return;
      this.breadcrumb.update((path) => path.slice(0, index + 1));
    }
    this.resetSearch();
  }
 
  private resetSearch(): void {
    this.searchTerm.set('');
  }
 
  // ---------- Paging ----------
  prevPage(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }
 
  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }
 
  // ---------- Add / Edit ----------
  openAdd(): void {
    this.modalDepartment.set(null);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }
 
  openEdit(department: Department): void {
    this.modalDepartment.set(department);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }
 
  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.modalDepartment.set(null);
   
    this.saveError.set(null);
  }
 
  onSaved(result: { title: string }): void {
    const title = result.title.trim();
    if (!title || this.saving()) return;
 
    this.saving.set(true);
    this.saveError.set(null);
 
    const edited = this.modalDepartment();
    // كل العناصر المعروضة أولاد المستوى الحالي
    const parentId = this.currentDepartment()?.id ?? null;
 
    const body: DepartmentRequest = { title, parentId };
    const request$: Observable<unknown> = edited
      ? this.api.update(edited.id, body)
      : this.api.create(body);
 
    request$
      .pipe(
        tap(() => {
          this.saving.set(false); // before closeModal(), which ignores the call while saving
          // keep the breadcrumb in sync if the renamed department is part of the path
          if (edited) {
            this.breadcrumb.update((path) =>
              path.map((d) => (d.id === edited.id ? { ...d, title } : d))
            );
          }
          this.closeModal();
          this.reload();
        }),
        catchError((err) => {
          this.saveError.set(err?.error?.message ?? 'Could not save the department. Please try again.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }
 
  // ---------- Delete ----------
  openDelete(department: Department): void {
    this.deleteTarget.set(department);
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
 
    this.api
      .delete(target.id)
      .pipe(
        tap(() => {
          this.closeDelete();
          // last item on the page: going back one page re-fetches by itself
          if (this.items().length === 1 && this.currentPage() > 1) {
            this.currentPage.update((p) => p - 1);
          } else {
            this.reload();
          }
        }),
        catchError((err) => {
          this.deleteError.set(
            err?.error?.message ?? 'Could not delete this department. It may be linked to other records.'
          );
          return EMPTY;
        }),
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }
 
  // ---------- Details ----------
  openDetails(department: Department): void {
    this.detailsDepartment.set(department);
  }
 
  closeDetails(): void {
    this.detailsDepartment.set(null);
  }
 
  // ---------- Escape ----------
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.detailsDepartment()) this.closeDetails();
    else if (this.deleteTarget()) this.cancelDelete();
  }
}
