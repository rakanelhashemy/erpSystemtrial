import { Component, computed, DestroyRef, HostListener, inject, linkedSignal, signal } from '@angular/core';
import { toSignal, toObservable, rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, map, distinctUntilChanged, tap, catchError, EMPTY, finalize, Subscription, Subject } from 'rxjs';
import { DropDownServices, DropdownItem } from '../../core/services/drop-down-services';
import { MaintenanceCompanyServices } from '../../core/services/maintenance-company-services';
import { MaintenanceCompany, MaintenanceCompanyRequest } from '../../core/models/maintenance-company-modal';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import {  MaintenanceCompyModalComponent } from './maintenance-compnaey-modal/maintenance-compnaey-modal.component';
import { LazyDropdownComponent } from '../../shared/ui/lazy-dropdown/lazy-dropdown.component';

@Component({
  imports: [HasPermissionDirective, MaintenanceCompyModalComponent, LazyDropdownComponent],
  selector: 'app-maintenance-companies',
  styleUrl: './maintenance-companies.component.css',
  templateUrl: './maintenance-companies.component.html',
})
export class MaintenanceCompaniesComponent { 
  private readonly api = inject(MaintenanceCompanyServices);
  private readonly dropdown = inject(DropDownServices);
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
 
  // ---------- Specialties ----------
  readonly specialties = signal<DropdownItem<number>[]>([]);
  readonly specialtyPage = signal(0);
  readonly specialtyHasMore = signal(false);
  readonly specialtyLoading = signal(false);
  private specialtyRequest?: Subscription;
  readonly specialtyFilterSearch = signal('');
  private readonly specialtyFilterSearch$ = new Subject<string>();
 
  // ---------- Advanced filters ----------
  readonly filtersOpen = signal(false);
  readonly draftAddress = signal('');
  readonly draftSpecialtyId = signal<number | null>(null);
  readonly appliedAddress = signal('');
  readonly appliedSpecialtyId = signal<number | null>(null);
 
  readonly activeFiltersCount = computed(
    () => (this.appliedAddress() ? 1 : 0) + (this.appliedSpecialtyId() ? 1 : 0),
  );

  constructor() {
    this.loadSpecialties(true);
    this.specialtyFilterSearch$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadSpecialties(true));
  }

  loadSpecialties(reset = false): void {
    if ((!reset && this.specialtyLoading()) || (!reset && !this.specialtyHasMore())) return;
    if (reset) {
      this.specialtyRequest?.unsubscribe();
      this.specialtyPage.set(0);
      this.specialtyHasMore.set(false);
      this.specialties.set([]);
    }
    const pageNumber = reset ? 1 : this.specialtyPage() + 1;
    this.specialtyLoading.set(true);
    this.specialtyRequest = this.dropdown.maintenanceCompanySpecialties({
      pageNumber,
      pageSize: 10,
      search: this.specialtyFilterSearch().trim(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        const page = response.data;
        this.specialties.update((current) => reset ? page.data : [...current, ...page.data]);
        this.specialtyPage.set(page.currentPage);
        this.specialtyHasMore.set(page.hasNextPage);
        this.specialtyLoading.set(false);
      },
      error: () => this.specialtyLoading.set(false),
    });
  }

  onSpecialtyFilterSearch(term: string): void {
    this.specialtyFilterSearch.set(term);
    this.specialtyFilterSearch$.next(term.trim());
  }
 
  /** resets itself to 1 whenever search, page size or filters change */
  readonly currentPage = linkedSignal<
    { search: string; size: number; address: string; specialtyId: number | null },
    number
  >({
    source: () => ({
      search: this.activeSearch(),
      size: this.pageSize(),
      address: this.appliedAddress(),
      specialtyId: this.appliedSpecialtyId(),
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
      specialtyId: this.appliedSpecialtyId(),
    }),
    stream: ({ params }) => this.api.list(params),
  });
 
  private readonly page = computed(() =>
    this.listResource.hasValue() ? this.listResource.value() : null,
  );
  readonly items = computed<MaintenanceCompany[]>(() => this.page()?.data ?? []);
  readonly total = computed(() => this.page()?.totalCount ?? 0);
  readonly loading = computed(() => this.listResource.isLoading());
  readonly error = computed(() =>
    this.listResource.error() ? 'Could not load maintenance companies.' : null,
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
  readonly modalCompany = signal<MaintenanceCompany | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
 
  // ---------- Delete modal ----------
  readonly deleteTarget = signal<MaintenanceCompany | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
 
  // ---------- Details modal ----------
  readonly detailsCompany = signal<MaintenanceCompany | null>(null);
  readonly detailsResource = rxResource({
    params: () => this.detailsCompany()?.id,
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
    this.appliedSpecialtyId.set(this.draftSpecialtyId());
  }
 
  resetFilters(): void {
    this.draftAddress.set('');
    this.draftSpecialtyId.set(null);
    this.appliedAddress.set('');
    this.appliedSpecialtyId.set(null);
    this.specialtyFilterSearch.set('');
    this.specialtyFilterSearch$.next('');
  }
 
  // ---------- Add / Edit ----------
  openAdd(): void {
    this.modalCompany.set(null);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }
 
  openEdit(company: MaintenanceCompany): void {
    this.modalCompany.set(company);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }
 
  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.modalCompany.set(null);
    this.saveError.set(null);
  }
 
  onSaved(body: MaintenanceCompanyRequest): void {
    if (this.saving()) return;
 
    this.saving.set(true);
    this.saveError.set(null);
 
    const edited = this.modalCompany();
    const request$ = edited ? this.api.update(edited.id, body) : this.api.create(body);
 
    request$
      .pipe(
        tap(() => {
          this.saving.set(false); // before closeModal(), which ignores the call while saving
          this.closeModal();
          this.reload();
          if (body.newSpecialtyName?.trim()) this.loadSpecialties(true);
        }),
        catchError((err) => {
          this.saveError.set(err?.error?.message ?? 'Could not save the company. Please try again.');
          return EMPTY;
        }),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
 
  // ---------- Delete ----------
  openDelete(company: MaintenanceCompany): void {
    this.deleteTarget.set(company);
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
            err?.error?.message ?? 'Could not delete this company. It may be linked to other records.',
          );
          return EMPTY;
        }),
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }
 
  // ---------- Details ----------
  openDetails(company: MaintenanceCompany): void {
    this.detailsCompany.set(company);
  }
 
  closeDetails(): void {
    this.detailsCompany.set(null);
  }
 
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.detailsCompany()) this.closeDetails();
    else if (this.deleteTarget()) this.cancelDelete();
  }}
