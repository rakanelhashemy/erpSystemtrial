import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, Subscription, debounceTime, forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { Item } from '../../core/models/items-modal';
import { DropDownServices, DropdownItem, StaticLookups } from '../../core/services/drop-down-services';
import { ItemsServices } from '../../core/services/items-services';
import { BusinessContextService } from '../../core/services/business-context.service';

interface ItemFilters {
  fromPrice: number | null;
  toPrice: number | null;
  currencyId: number | null;
  brandId: number | null;
  modelId: number | null;
  materialId: number | null;
  countryId: number | null;
  departmentId: string | null;
  groupId: string | null;
  locationId: string | null;
  capacity: string;
  fromWorkingDate: string;
  toWorkingDate: string;
  depreciationRate: number | null;
  depreciationYears: number | null;
  fromDepreciationDate: string;
  toDepreciationDate: string;
  scraping: boolean;
}

const emptyFilters = (): ItemFilters => ({
  fromPrice: null,
  toPrice: null,
  currencyId: null,
  brandId: null,
  modelId: null,
  materialId: null,
  countryId: null,
  departmentId: null,
  groupId: null,
  locationId: null,
  capacity: '',
  fromWorkingDate: '',
  toWorkingDate: '',
  depreciationRate: null,
  depreciationYears: null,
  fromDepreciationDate: '',
  toDepreciationDate: '',
  scraping: false,
});

@Component({
  imports: [FormsModule],
  selector: 'app-items',
  styleUrl: './items.component.css',
  templateUrl: './items.component.html',
})
export class ItemsComponent implements OnInit {
  private readonly itemService = inject(ItemsServices);
  private readonly dd = inject(DropDownServices);
  private readonly router = inject(Router);
  private readonly businessCtx = inject(BusinessContextService);

  readonly businessPageSize = 20;
  readonly searchDebounceMs = 400;
  readonly businessSearchDebounceMs = 300;

  private tableSearch$ = new Subject<string>();
  private businessSearch$ = new Subject<string>();
  private lastTableSearch = '';
  private lastBusinessSearch = '';
  private loadSub?: Subscription;
  private dropdownsSub?: Subscription;
  private businessSub?: Subscription;
  private businessCache: { items: DropdownItem[]; hasNext: boolean; page: number } | null = null;

  private businessSentinel = viewChild<ElementRef<HTMLElement>>('businessSentinel');

  // ---------- business dropdown state ----------
  businesses = signal<DropdownItem[]>([]);
  selectedBusiness = signal<DropdownItem | null>(null);
  businessSearch = signal('');
  businessPage = signal(0); // last loaded page
  businessHasNext = signal(false);
  businessLoading = signal(false);
  dropdownOpen = signal(false);
  businessId = signal('');

  // ---------- table state ----------
  items = signal<Item[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  pageNumber = signal(1);
  pageSize = signal(10);
  totalPages = signal(1);
  totalCount = signal(0);

  search = signal('');

  filtersOpen = signal(false);
  filters: ItemFilters = emptyFilters();
  private applied = signal<ItemFilters>(emptyFilters());

  activeFiltersCount = computed(() => {
    const f = this.applied();
    const e = emptyFilters();
    return (Object.keys(e) as (keyof ItemFilters)[]).filter((k) => f[k] !== e[k]).length;
  });

  from = computed(() => (this.totalCount() === 0 ? 0 : (this.pageNumber() - 1) * this.pageSize() + 1));
  to = computed(() => Math.min(this.pageNumber() * this.pageSize(), this.totalCount()));

  // ---------- filter dropdowns ----------
  brands = signal<DropdownItem[]>([]);
  models = signal<DropdownItem[]>([]);
  materials = signal<DropdownItem[]>([]);
  groups = signal<DropdownItem[]>([]);
  departments = signal<DropdownItem[]>([]);
  locations = signal<DropdownItem[]>([]);
  lookups = signal<StaticLookups>({ countries: [], currencies: [], genders: [] });

  constructor() {
    // When the shared business changes: reset everything that belongs to the old business
    effect(() => {
      const selection = this.businessCtx.selectedBusiness();
      if (selection && selection.id !== untracked(() => this.businessId())) {
        untracked(() => {
          this.businessId.set(selection.id);
          this.selectedBusiness.set(selection);
          this.resetStateForBusiness();
          this.loadDropdowns();
          this.load();
        });
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

  private resetStateForBusiness(): void {
    // filter ids (brand, model, ...) belong to the old business, so clear them
    this.filters = emptyFilters();
    this.applied.set(emptyFilters());
    this.search.set('');
    this.lastTableSearch = '';
    this.pageNumber.set(1);
    this.items.set([]);
    this.totalCount.set(0);
    this.totalPages.set(1);
  }

  // ---------- Business dropdown ----------

  loadBusinesses(reset = false): void {
    const page = reset ? 1 : this.businessPage() + 1;
    const term = this.businessSearch().trim();
    if (reset) this.lastBusinessSearch = term;

    this.businessSub?.unsubscribe();
    this.businessLoading.set(true);

    this.businessSub = this.dd
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

          const sharedSelection = this.businessCtx.selectedBusiness();
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
    this.businessCtx.select(b);
    this.closeBusinessDropdown();
  }

  // ---------- Items data ----------

  load(): void {
    const businessId = this.businessId();
    if (!businessId) return;

    this.loading.set(true);
    this.error.set(null);

    this.loadSub?.unsubscribe(); // cancel the previous request
    this.loadSub = this.itemService
      .list({
        businessId,
        pageNumber: this.pageNumber(),
        pageSize: this.pageSize(),
        search: this.search(),
        ...this.applied(),
        scraping: this.applied().scraping ? true : null,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res.data);
          this.totalPages.set(res.totalPages || 1);
          this.totalCount.set(res.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load items.');
        },
      });
  }

  private loadDropdowns(): void {
    const businessId = this.businessId();
    if (!businessId) return;
    const q = { businessId };

    this.dropdownsSub?.unsubscribe();
    // لو شكل الـ Paged مختلف عندك عدّل res.data.data
    this.dropdownsSub = forkJoin({
      brands: this.dd.brands(q),
      models: this.dd.itemModels(q),
      materials: this.dd.materials(q),
      groups: this.dd.groups(q),
      departments: this.dd.departments(q),
      locations: this.dd.locations(q),
      lookups: this.dd.staticLookups(),
    }).subscribe({
      next: (r) => {
        this.brands.set(r.brands.data.data);
        this.models.set(r.models.data.data);
        this.materials.set(r.materials.data.data);
        this.groups.set(r.groups.data.data);
        this.departments.set(r.departments.data.data);
        this.locations.set(r.locations.data.data);
        this.lookups.set(r.lookups);
      },
      error: () => this.error.set('Could not load filter options.'),
    });
  }

  // ---------- search / filters ----------
  onSearch(term: string): void {
    this.search.set(term);
    this.tableSearch$.next(term);
  }

  toggleFilters(): void {
    this.filtersOpen.update((v) => !v);
  }

  applyFilters(): void {
    this.applied.set({ ...this.filters });
    this.pageNumber.set(1);
    this.load();
  }

  resetFilters(): void {
    this.filters = emptyFilters();
    this.applyFilters();
  }

  // ---------- paging ----------
  onPageSizeChange(size: number): void {
    this.pageSize.set(+size);
    this.pageNumber.set(1);
    this.load();
  }

  prev(): void {
    if (this.pageNumber() <= 1) return;
    this.pageNumber.update((p) => p - 1);
    this.load();
  }

  next(): void {
    if (this.pageNumber() >= this.totalPages()) return;
    this.pageNumber.update((p) => p + 1);
    this.load();
  }

  // ---------- actions ----------
  add(): void {
    
  }

  edit(item: Item): void {

  }

  remove(item: Item): void {
    if (!confirm(`Delete "${item.itemName}"?`)) return;

    this.itemService.delete(item.id).subscribe({
      next: () => {
        toast.success('Item deleted successfully');
        // لو مسحت آخر عنصر في الصفحة، ارجع صفحة
        if (this.items().length === 1 && this.pageNumber() > 1) {
          this.pageNumber.update((p) => p - 1);
        }
        this.load();
      },
      error: () => {
        this.error.set('Could not delete the item.');
        toast.error('Could not delete item');
      },
    });
  }
}