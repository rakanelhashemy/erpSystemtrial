import { Component, computed, effect, ElementRef, DestroyRef, HostListener, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, tap, switchMap, catchError, EMPTY, debounceTime, filter } from 'rxjs';
import { FormsModule } from '@angular/forms';

import { LocationService } from '../../core/services/location-service';

import { DropdownItem, DropDownServices } from '../../core/services/drop-down-services';
import { BusinessContextService } from '../../core/services/business-context.service';
import { LocationItem } from '../../core/models/location-modal';
import { LocationModalComponent } from './location-modal/location-modal.component';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';


@Component({
  imports: [FormsModule, LocationModalComponent, HasPermissionDirective],
  selector: 'app-location',
  styleUrl: './location.component.css',
  templateUrl: './location.component.html',
})
export class LocationComponent implements OnInit {
  private readonly api = inject(LocationService);
  private readonly dropdownService = inject(DropDownServices);
  private readonly businessContext = inject(BusinessContextService);
  private readonly destroyRef = inject(DestroyRef);

  readonly businessPageSize = 10;
  readonly businessSearchDebounceMs = 300;

  // ---------- Business dropdown (infinite scroll + server-side search) ----------
  private readonly businessSentinel = viewChild<ElementRef<HTMLElement>>('businessSentinel');
  private businessSearch$ = new Subject<string>();
  private lastBusinessSearch = '';
  private businessSub?: Subscription;
  private businessCache: { items: DropdownItem[]; hasNext: boolean; page: number } | null = null;

  readonly businessId = signal('');
  readonly businesses = signal<DropdownItem[]>([]);
  readonly selectedBusiness = signal<DropdownItem | null>(null);
  readonly businessSearch = signal('');
  readonly businessPage = signal(0);
  readonly businessHasNext = signal(false);
  readonly businessLoading = signal(false);
  readonly dropdownOpen = signal(false);

  // ---------- List state ----------
  readonly items = signal<LocationItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // ---------- Filters ----------
  readonly searchTerm = signal('');
  readonly pageSize = signal(10);
  readonly currentPage = signal(1);

  // ---------- Navigation ----------
  readonly breadcrumb = signal<LocationItem[]>([]);
  readonly currentLocation = computed(() => this.breadcrumb().at(-1) ?? null);

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
  readonly modalLocation = signal<LocationItem | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  // ---------- Delete modal ----------
  readonly deleteTarget = signal<LocationItem | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  // ---------- Details modal ----------
  readonly detailsOpen = signal(false);
  readonly detailsLocation = signal<LocationItem | null>(null);
  readonly detailsLoading = signal(false);
  readonly detailsError = signal<string | null>(null);
  private detailsRequestId = 0;
  private lastDetailsId: string | null = null;

  // ---------- Request pipeline (switchMap cancels the old request) ----------
  private readonly reload$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  constructor() {
    // Follow the shared business selection; reset the tree when it changes
    effect(() => {
      const selection = this.businessContext.selectedBusiness();
      if (selection && selection.id !== this.businessId()) {
        this.businessId.set(selection.id);
        this.selectedBusiness.set(selection);
        this.breadcrumb.set([]);
        this.resetFilters();
        this.load();
      }
    });

    // Infinite scroll for the business dropdown
    effect((onCleanup) => {
      const el = this.businessSentinel()?.nativeElement;
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && this.businessHasNext() && !this.businessLoading()) {
            this.loadBusinesses();
          }
        },
        { rootMargin: '40px' },
      );
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });

    this.reload$
      .pipe(
        filter(() => !!this.businessId()), // nothing to load until a business is selected
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
              parentId: this.currentLocation()?.id ?? null,
              businessId: this.businessId(),
            })
            .pipe(
              catchError(() => {
                this.error.set('Could not load locations.');
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

    this.businessSearch$
      .pipe(debounceTime(this.businessSearchDebounceMs), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.businessSearch().trim() === this.lastBusinessSearch) return;
        this.loadBusinesses(true);
      });
  }

  ngOnInit(): void {
    this.loadBusinesses(true);
  }

  load(): void {
    this.reload$.next();
  }

  // ---------- Business dropdown ----------
  loadBusinesses(reset = false): void {
    const page = reset ? 1 : this.businessPage() + 1;
    const term = this.businessSearch().trim();
    if (reset) this.lastBusinessSearch = term;

    this.businessSub?.unsubscribe();
    this.businessLoading.set(true);

    this.businessSub = this.dropdownService
      .businesses({ pageNumber: page, pageSize: this.businessPageSize, search: term })
      .subscribe({
        next: (res) => {
          const p = res.data;
          this.businesses.update((cur) => (reset ? p.data : [...cur, ...p.data]));
          this.businessPage.set(p.currentPage);
          this.businessHasNext.set(p.hasNextPage);
          this.businessLoading.set(false);

          if (reset && !term) {
            this.businessCache = { items: p.data, hasNext: p.hasNextPage, page: p.currentPage };
          }

          const shared = this.businessContext.selectedBusiness();
          if (shared) {
            const selected = p.data.find((item) => item.id === shared.id);
            if (selected) this.selectedBusiness.set(selected);
          }
        },
        error: () => {
          this.businessLoading.set(false);
          this.error.set('Could not load businesses.');
        },
      });
  }

  onBusinessSearch(term: string): void {
    this.businessSearch.set(term);
    this.businessSearch$.next(term);
  }

  openBusinessDropdown(): void {
    this.dropdownOpen.set(true);
  }

  closeBusinessDropdown(): void {
    this.dropdownOpen.set(false);
    if (!this.businessSearch()) return;

    this.businessSearch.set('');
    const cache = this.businessCache;
    if (cache) {
      this.businessSub?.unsubscribe();
      this.businessLoading.set(false);
      this.lastBusinessSearch = '';
      this.businesses.set(cache.items);
      this.businessPage.set(cache.page);
      this.businessHasNext.set(cache.hasNext);
    } else {
      this.loadBusinesses(true);
    }
  }

  selectBusiness(b: DropdownItem): void {
    this.businessContext.select(b);
    this.closeBusinessDropdown();
  }

  // ---------- Navigation ----------
  openChild(location: LocationItem): void {
    this.breadcrumb.update((path) => [...path, location]);
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
    this.modalLocation.set(null);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(location: LocationItem): void {
    this.modalLocation.set(location);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.modalLocation.set(null);
    this.saveError.set(null);
  }

  onSaved(result: { name: string; locationTypeId: string | null }): void {
    const name = result.name.trim();
    if (!name || this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const edited = this.modalLocation();
    // كل العناصر المعروضة أولاد المستوى الحالي
    const parentId = this.currentLocation()?.id ?? null;
    const businessId = this.businessId();

    const request$ = edited
      ? this.api.update(edited.id, { name, parentId, businessId, locationTypeId: result.locationTypeId ?? edited.locationTypeId ?? null })
      : this.api.create({ name, parentId, businessId, locationTypeId: result.locationTypeId ?? null });

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        console.log(res);
        
        // keep the breadcrumb in sync if the renamed location is part of the path
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
        this.saveError.set(err?.error?.message ?? 'Could not save the location. Please try again.');
      },
    });
  }

  // ---------- Delete ----------
  openDelete(location: LocationItem): void {
    this.deleteTarget.set(location);
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
          err?.error?.message ?? 'Could not delete this location. It may be linked to items.'
        );
      },
    });
  }

  // ---------- Details ----------
  openDetails(location: LocationItem): void {
    this.detailsLocation.set(null);
    this.detailsOpen.set(true);
    this.fetchDetails(location.id);
  }

  fetchDetails(id: string): void {
    this.lastDetailsId = id;
    const requestId = ++this.detailsRequestId;
    this.detailsLoading.set(true);
    this.detailsError.set(null);

    this.api.getById(id).subscribe({
      next: (res) => {
        if (requestId !== this.detailsRequestId) return; // ignore stale response
        this.detailsLocation.set(res.data ?? null);
        if (!res.data) this.detailsError.set('Location not found.');
        this.detailsLoading.set(false);
      },
      error: (err) => {
        if (requestId !== this.detailsRequestId) return;
        this.detailsError.set(err?.error?.message ?? 'Could not load location details.');
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
    this.detailsLocation.set(null);
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
