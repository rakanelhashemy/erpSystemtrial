import { Component, computed, DestroyRef, HostListener, inject, linkedSignal, signal } from '@angular/core';
import { toSignal, toObservable, rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, map, distinctUntilChanged, tap, catchError, EMPTY, finalize } from 'rxjs';
import { Supplier, SupplierRequest } from '../../core/models/supplires-Modal';
import { Suppliers } from '../../core/services/suppliers-service';
import { DropdownItem, DropDownServices } from '../../core/services/drop-down-services';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { SuppliersModalComponent } from './suppliers-modal/suppliers-modal.component';
interface Category {
  id: number;
  name: string;
}
@Component({
  imports: [HasPermissionDirective, SuppliersModalComponent],
  selector: 'app-suppliers',
  styleUrl: './suppliers.component.css',
  templateUrl: './suppliers.component.html',
})
export class SuppliersComponent {
 private readonly api = inject(Suppliers);
  private readonly dropdown = inject(DropDownServices);
  private readonly destroyRef = inject(DestroyRef);

  // ---------- Search / paging ----------
  readonly pageSizeOptions = [5, 10, 25, 50];
  readonly searchTerm = signal('');
  readonly pageSize = signal(10);

  private readonly debouncedSearch = toSignal(
    toObservable(this.searchTerm).pipe(
      debounceTime(300),
      map((term) => term.trim()),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  /** an empty box applies immediately */
  private readonly activeSearch = computed(() =>
    this.searchTerm().trim() ? this.debouncedSearch() : '',
  );

  // ---------- Categories ----------
  readonly categories = toSignal(
    this.dropdown
      .supplierCategories({ pageNumber: 1, pageSize: 100 })
      .pipe(map((res) => res.data.data)),
    { initialValue: [] as DropdownItem<number>[] },
  );

  // ---------- Advanced filters ----------
  readonly filtersOpen = signal(false);
  readonly draftAddress = signal('');
  readonly draftCategoryId = signal<number | null>(null);
  readonly appliedAddress = signal('');
  readonly appliedCategoryId = signal<number | null>(null);

  readonly activeFiltersCount = computed(
    () => (this.appliedAddress() ? 1 : 0) + (this.appliedCategoryId() ? 1 : 0),
  );

  
  readonly currentPage = linkedSignal<
    { search: string; size: number; address: string; categoryId: number | null },
    number
  >({
    source: () => ({
      search: this.activeSearch(),
      size: this.pageSize(),
      address: this.appliedAddress(),
      categoryId: this.appliedCategoryId(),
    }),
    computation: () => 1,
  });

  // ---------- List ----------
  private readonly listResource = rxResource({
    params: () => ({
      pageNumber: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.activeSearch(),
      address: this.appliedAddress(),
      categoryId: this.appliedCategoryId(),
    }),
    stream: ({ params }) => this.api.list(params),
  });

  private readonly page = computed(() =>
    this.listResource.hasValue() ? this.listResource.value() : null,
  );
  readonly items = computed<Supplier[]>(() => this.page()?.data ?? []);
  readonly total = computed(() => this.page()?.totalCount ?? 0);
  readonly loading = computed(() => this.listResource.isLoading());
  readonly error = computed(() =>
    this.listResource.error() ? 'Could not load suppliers.' : null,
  );

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
  readonly modalSupplier = signal<Supplier | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  // ---------- Delete modal ----------
  readonly deleteTarget = signal<Supplier | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  // ---------- Details modal ----------
  readonly detailsSupplier = signal<Supplier | null>(null);
  readonly detailsResource = rxResource({
    params: () => this.detailsSupplier()?.id,
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

  // ---------- Filters ----------
  applyFilters(): void {
    this.appliedAddress.set(this.draftAddress().trim());
    this.appliedCategoryId.set(this.draftCategoryId());
  }

  resetFilters(): void {
    this.draftAddress.set('');
    this.draftCategoryId.set(null);
    this.appliedAddress.set('');
    this.appliedCategoryId.set(null);
  }

  // ---------- Add / Edit ----------
  openAdd(): void {
    this.modalSupplier.set(null);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(supplier: Supplier): void {
    this.modalSupplier.set(supplier);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.modalSupplier.set(null);
    this.saveError.set(null);
  }

  onSaved(body: SupplierRequest): void {
    if (this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const edited = this.modalSupplier();
    const request$ = edited ? this.api.update(edited.id, body) : this.api.create(body);

    request$
      .pipe(
        tap(() => {
          this.saving.set(false); // before closeModal(), which ignores the call while saving
          this.closeModal();
          this.reload();
        }),
        catchError((err) => {
          this.saveError.set(err?.error?.message ?? 'Could not save the supplier. Please try again.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // ---------- Delete ----------
  openDelete(supplier: Supplier): void {
    this.deleteTarget.set(supplier);
    this.deleteError.set(null);
  }

  closeDelete(): void {
    this.deleteTarget.set(null);
    this.deleteError.set(null);
  }

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
          if (this.items().length === 1 && this.currentPage() > 1) {
            this.currentPage.update((p) => p - 1);
          } else {
            this.reload();
          }
        }),
        catchError((err) => {
          this.deleteError.set(
            err?.error?.message ?? 'Could not delete this supplier. It may be linked to other records.',
          );
          return EMPTY;
        }),
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // ---------- Details ----------
  openDetails(supplier: Supplier): void {
    this.detailsSupplier.set(supplier);
  }

  closeDetails(): void {
    this.detailsSupplier.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.detailsSupplier()) this.closeDetails();
    else if (this.deleteTarget()) this.cancelDelete();
  }
}
