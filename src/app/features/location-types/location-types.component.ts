import { Component, computed, effect, ElementRef, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { LocationTypeService } from '../../core/services/location-type-service';
import { LocationType } from '../../core/models/location-type-model';
import { FormsModule } from '@angular/forms';

import { LocationTypeModalComponent } from './location-type-modal/location-type-modal.component';
import { DropdownItem, DropDownServices } from '../../core/services/drop-down-services';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BusinessContextService } from '../../core/services/business-context.service';
import { toast } from 'ngx-sonner';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

@Component({
  imports: [FormsModule, LocationTypeModalComponent, HasPermissionDirective],
  selector: 'app-location-types',
  styleUrl: './location-types.component.css',
  templateUrl: './location-types.component.html',
})
export class LocationTypesComponent {
    private service = inject(LocationTypeService);
  private dropdownService = inject(DropDownServices);
  private businessContext = inject(BusinessContextService);
 
  readonly pageSize = 10;
  readonly businessPageSize = 10;
  readonly searchDebounceMs = 400;
  readonly businessSearchDebounceMs = 300;
 
  private tableSearch$ = new Subject<string>();
  private businessSearch$ = new Subject<string>();
  private lastTableSearch = '';
  private lastBusinessSearch = '';
  private loadSub?: Subscription;
  private businessSub?: Subscription;
  private businessCache: { items: DropdownItem[]; hasNext: boolean; page: number } | null = null;
 
 
  private businessSentinel = viewChild<ElementRef<HTMLElement>>('businessSentinel');
 
 
  businesses = signal<DropdownItem[]>([]);
  selectedBusiness = signal<DropdownItem | null>(null);
  businessSearch = signal('');
  businessPage = signal(0); // last loaded page
  businessHasNext = signal(false);
  businessLoading = signal(false);
  dropdownOpen = signal(false);
 
  businessId = signal('');
  search = signal('');
  pageNumber = signal(1);
 
  items = signal<LocationType[]>([]);
  totalCount = signal(0);
  totalPages = signal(1);
  hasPreviousPage = signal(false);
  hasNextPage = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
 
  modalOpen = signal(false);
  editing = signal<LocationType | null>(null);
 
  from = computed(() => (this.totalCount() === 0 ? 0 : (this.pageNumber() - 1) * this.pageSize + 1));
  to = computed(() => Math.min(this.pageNumber() * this.pageSize, this.totalCount()));
 
  constructor() {
    effect(() => {
      const selection = this.businessContext.selectedBusiness();
      if (selection && selection.id !== this.businessId()) {
        this.businessId.set(selection.id);
        this.selectedBusiness.set(selection);
        this.pageNumber.set(1);
        this.load();
      }
    });
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
 
    // Table search: wait until the user stops typing, skip if nothing really changed
    this.tableSearch$
      .pipe(debounceTime(this.searchDebounceMs), takeUntilDestroyed())
      .subscribe(() => {
        const term = this.search().trim();
        if (term === this.lastTableSearch) return;
        this.lastTableSearch = term;
        this.pageNumber.set(1);
        this.load();
      });
 
    // Business dropdown search
    this.businessSearch$
      .pipe(debounceTime(this.businessSearchDebounceMs), takeUntilDestroyed())
      .subscribe(() => {
        if (this.businessSearch().trim() === this.lastBusinessSearch) return;
        this.loadBusinesses(true);
      });
  }
 
  ngOnInit(): void {
    this.loadBusinesses(true);
  }
 
  // ---------- Business dropdown ----------
 
  loadBusinesses(reset = false): void {
    const page = reset ? 1 : this.businessPage() + 1;
    const term = this.businessSearch().trim();
    if (reset) this.lastBusinessSearch = term;
 
    this.businessSub?.unsubscribe();
    this.businessLoading.set(true);
 
    this.businessSub = this.dropdownService
      .businesses({
        pageNumber: page,
        pageSize: this.businessPageSize,
        search: term,
      })
      .subscribe({
        next: (res) => {
          const p = res.data;
          this.businesses.update((cur) => (reset ? p.data : [...cur, ...p.data]));
          this.businessPage.set(p.currentPage);
          this.businessHasNext.set(p.hasNextPage);
          this.businessLoading.set(false);
 
          // keep the first unfiltered page so closing a search needs no extra request
          if (reset && !term) {
            this.businessCache = { items: p.data, hasNext: p.hasNextPage, page: p.currentPage };
          }
 
          const sharedSelection = this.businessContext.selectedBusiness();
          if (sharedSelection) {
            const selected = p.data.find((item) => item.id === sharedSelection.id);
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
 
  // ---------- Location types ----------
 
  load(): void {
    const businessId = this.businessId();
    if (!businessId) return;
 
    this.loading.set(true);
    this.error.set(null);
 
    this.loadSub?.unsubscribe(); // cancel the previous request
    this.loadSub = this.service
      .list({
        businessId,
        pageNumber: this.pageNumber(),
        pageSize: this.pageSize,
        search: this.search(),
      })
      .subscribe({
        next: (res) => {
          const page = res.data;
          this.items.set(page.data);
          this.totalCount.set(page.totalCount);
          this.totalPages.set(page.totalPages || 1);
          this.hasPreviousPage.set(page.hasPreviousPage);
          this.hasNextPage.set(page.hasNextPage);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load location types.');
        },
      });
  }
 
  onBusinessChange(id: string): void {
    const business = this.businesses().find((item) => item.id === id);
    if (business) this.businessContext.select(business);
  }
 
  onSearch(term: string): void {
    this.search.set(term);
    this.tableSearch$.next(term);
  }
 
  prev(): void {
    if (!this.hasPreviousPage()) return;
    this.pageNumber.update((p) => p - 1);
    this.load();
  }
 
  next(): void {
    if (!this.hasNextPage()) return;
    this.pageNumber.update((p) => p + 1);
    this.load();
  }
 
  openAdd(): void {
    this.editing.set(null);
    this.modalOpen.set(true);
  }
 
  openEdit(item: LocationType): void {
    this.editing.set(item);
    this.modalOpen.set(true);
  }
 
  closeModal(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
  }
 
  onSaved(): void {
    this.closeModal();
    this.load();
  }
 
  remove(item: LocationType): void {
    if (!confirm(`Delete "${item.name}"?`)) return;
 
    this.service.delete(item.id).subscribe({
      next: () => {
        toast.success('Location type deleted successfully');
        // لو ده كان آخر عنصر في الصفحة ارجع صفحة
        if (this.items().length === 1 && this.pageNumber() > 1) {
          this.pageNumber.update((p) => p - 1);
        }
        this.load();
      },
      error: () => {
        this.error.set('Could not delete the location type.');
        toast.error('Could not delete location type');
      },
    });
  }
}
