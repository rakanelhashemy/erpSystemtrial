import {
  Component,
  ChangeDetectionStrategy,
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
import { Subject, Subscription, debounceTime } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { Item } from '../../core/models/items-modal';
import { DropDownServices, DropdownItem, StaticLookups } from '../../core/services/drop-down-services';
import { ItemsServices } from '../../core/services/items-services';
import { BusinessContextService } from '../../core/services/business-context.service';
import { ItemModalComponent } from './item-modal/item-modal.component';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { toImageUrl } from '../../core/config/image-url';
import { LazyDropdownComponent, LazyDropdownOption } from '../../shared/ui/lazy-dropdown/lazy-dropdown.component';


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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ItemModalComponent, HasPermissionDirective, LazyDropdownComponent],
  selector: 'app-items',
  styleUrl: './items.component.css',
  templateUrl: './items.component.html',
})
export class ItemsComponent implements OnInit {
  private readonly itemService = inject(ItemsServices);
  private readonly dd = inject(DropDownServices);
  private readonly businessCtx = inject(BusinessContextService);

  readonly businessPageSize = 10;
  readonly searchDebounceMs = 400;
  readonly businessSearchDebounceMs = 300;


  readonly imageUrl = (path: string | null | undefined) => toImageUrl(path);

  private tableSearch$ = new Subject<string>();
  private businessSearch$ = new Subject<string>();
  private lastTableSearch = '';
  private lastBusinessSearch = '';
  private loadSub?: Subscription;
  private businessSub?: Subscription;
  private readonly filterDropdownSubs: Record<string, Subscription> = {};
  private readonly filterDropdownSearchSubjects: Record<string, Subject<string>> = Object.fromEntries(
    ['brands', 'models', 'materials', 'groups', 'departments', 'locations']
      .map((key) => [key, new Subject<string>()]),
  );
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

  // ---------- table state ----------
  items = signal<Item[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  modalOpen = signal(false);
  editingId = signal<string | null>(null);

  // ---------- details modal ----------
  detailsItem = signal<Item | null>(null);
  detailsData = signal<Record<string, any> | null>(null);
  detailsLoading = signal(false);
  detailsError = signal(false);
  private detailsSub?: Subscription;

  detailsImage = computed(() => toImageUrl(this.detailsData()?.['imagePath']));

  detailsRows = computed(() => {
    const d = this.detailsData();
    if (!d) return [];
    const date = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 10) : null);
    const rows: [string, unknown][] = [
      ['Code', d['code']],
      ['Serial number', d['serialNumber']],
      ['Group', d['groupName']],
      ['Location', d['locationName']],
      ['Department', d['departmentTitle']],
      ['Price', d['price'] != null ? `${d['price']} ${d['currencyName'] ?? ''}`.trim() : null],
      ['Exchange rate', d['exchangeRate']],
      ['Price in default currency', d['priceInDefaultCurrency']],
      ['Brand', d['brandName']],
      ['Model', d['modelName']],
      ['Material', d['materialName']],
      ['Country', d['countryName']],
      ['Capacity', d['capacity']],
      ['Dimensions', d['dimensions']],
      ['Quantity', d['quantity']],
      ['Description', d['description']],
      ['Working date', date(d['workingDate'])],
      ['Depreciation rate', d['depreciationRate']],
      ['Depreciation years', d['depreciationYears']],
      ['Depreciation date', date(d['depreciationDate'])],
      ['Scraping', d['scraping'] ? 'Yes' : 'No'],
      ['Created by', d['createdByName']],
      ['Updated by', d['updatedByName']],
    ];
    return rows.map(([label, value]) => ({
      label,
      value: value === null || value === undefined || value === '' ? '—' : String(value),
    }));
  });

  deleteTarget = signal<Item | null>(null);
  deleting = signal(false);
  deleteError = signal<string | null>(null);

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
  readonly filterDropdownPageSize = 10;
  readonly filterDropdownPages = signal<Record<string, number>>({});
  readonly filterDropdownHasMore = signal<Record<string, boolean>>({});
  readonly filterDropdownLoading = signal<Record<string, boolean>>({});
  readonly filterDropdownSearch = signal<Record<string, string>>({});

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

    for (const [key, search$] of Object.entries(this.filterDropdownSearchSubjects)) {
      search$
        .pipe(debounceTime(250), takeUntilDestroyed())
        .subscribe(() => this.loadFilterDropdown(key, true));
    }
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

    Object.values(this.filterDropdownSubs).forEach((subscription) => subscription.unsubscribe());
    this.filterDropdownPages.set({});
    this.filterDropdownHasMore.set({});
    this.filterDropdownLoading.set({});
    this.filterDropdownSearch.set({});
    this.brands.set([]);
    this.models.set([]);
    this.materials.set([]);
    this.groups.set([]);
    this.departments.set([]);
    this.locations.set([]);
    for (const key of ['brands', 'models', 'materials', 'groups', 'departments', 'locations']) {
      this.loadFilterDropdown(key, true);
    }
    this.dd.staticLookups().subscribe({
      next: (lookups) => this.lookups.set(lookups),
      error: () => this.error.set('Could not load filter options.'),
    });
  }

  loadFilterDropdown(key: string, reset = false): void {
    const businessId = this.businessId();
    if (!businessId) return;
    if (!reset && (this.filterDropdownLoading()[key] || (!this.filterDropdownHasMore()[key] && this.filterDropdownPages()[key]))) return;
    if (reset) {
      this.filterDropdownSubs[key]?.unsubscribe();
      this.filterDropdownPages.update((state) => ({ ...state, [key]: 0 }));
      this.filterDropdownHasMore.update((state) => ({ ...state, [key]: false }));
      const clearOptions = () => [];
      if (key === 'brands') this.brands.set(clearOptions());
      else if (key === 'models') this.models.set(clearOptions());
      else if (key === 'materials') this.materials.set(clearOptions());
      else if (key === 'groups') this.groups.set(clearOptions());
      else if (key === 'departments') this.departments.set(clearOptions());
      else this.locations.set(clearOptions());
    }
    const pageNumber = reset ? 1 : (this.filterDropdownPages()[key] ?? 0) + 1;
    this.filterDropdownLoading.update((state) => ({ ...state, [key]: true }));
    const query = {
      businessId,
      pageNumber,
      pageSize: this.filterDropdownPageSize,
      search: this.filterDropdownSearch()[key]?.trim() ?? '',
    };
    const request = key === 'brands' ? this.dd.brands(query)
      : key === 'models' ? this.dd.itemModels(query)
      : key === 'materials' ? this.dd.materials(query)
      : key === 'groups' ? this.dd.groups(query)
      : key === 'departments' ? this.dd.departments(query)
      : this.dd.locations(query);
    this.filterDropdownSubs[key]?.unsubscribe();
    this.filterDropdownSubs[key] = request.subscribe({
      next: (response) => {
        const page = response.data;
        const items = page.data;
        const update = (current: DropdownItem[]) => reset ? items : [...current, ...items];
        if (key === 'brands') this.brands.update(update);
        else if (key === 'models') this.models.update(update);
        else if (key === 'materials') this.materials.update(update);
        else if (key === 'groups') this.groups.update(update);
        else if (key === 'departments') this.departments.update(update);
        else this.locations.update(update);
        this.filterDropdownPages.update((state) => ({ ...state, [key]: page.currentPage }));
        this.filterDropdownHasMore.update((state) => ({ ...state, [key]: page.hasNextPage }));
        this.filterDropdownLoading.update((state) => ({ ...state, [key]: false }));
      },
      error: () => {
        this.filterDropdownLoading.update((state) => ({ ...state, [key]: false }));
        this.error.set('Could not load filter options.');
      },
    });
  }

  filterOptions(key: string): LazyDropdownOption[] {
    const options = key === 'brands' ? this.brands()
      : key === 'models' ? this.models()
      : key === 'materials' ? this.materials()
      : key === 'groups' ? this.groups()
      : key === 'departments' ? this.departments()
      : this.locations();
    return options.map((option) => ({ id: option.id, name: option.title ?? option.name }));
  }

  onFilterDropdownSearch(key: string, term: string): void {
    this.filterDropdownSearch.update((searches) => ({ ...searches, [key]: term }));
    this.filterDropdownSearchSubjects[key]?.next(term.trim());
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
    this.filterDropdownSearch.set({});
    for (const search$ of Object.values(this.filterDropdownSearchSubjects)) search$.next('');
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
    if (!this.businessId()) {
      toast.error('Select a business first');
      return;
    }
    this.editingId.set(null);
    this.modalOpen.set(true);
  }

  edit(item: Item): void {
    this.editingId.set(item.id);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
  }

  onSaved(): void {
    this.closeModal();
    this.pageNumber.set(1);
    this.load();
  }

  // ---------- details modal ----------
  openDetails(item: Item): void {
    this.detailsItem.set(item);
    this.detailsData.set({ ...item }); // show list data immediately
    this.fetchDetails(item.id);
  }

  reloadDetails(): void {
    const item = this.detailsItem();
    if (item) this.fetchDetails(item.id);
  }

  private fetchDetails(id: string): void {
    this.detailsSub?.unsubscribe();
    this.detailsLoading.set(true);
    this.detailsError.set(false);

    this.detailsSub = this.itemService.getById(id).subscribe({
      next: (res) => {
        // accepts the item itself or a { data: item } wrapper
        const full = ((res as { data?: unknown } | null)?.data ?? res ?? {}) as Record<string, any>;
        this.detailsData.update((cur) => ({ ...cur, ...full }));
        this.detailsLoading.set(false);
      },
      error: () => {
        this.detailsLoading.set(false);
        this.detailsError.set(true);
      },
    });
  }

  closeDetails(): void {
    this.detailsSub?.unsubscribe();
    this.detailsItem.set(null);
    this.detailsData.set(null);
    this.detailsLoading.set(false);
    this.detailsError.set(false);
  }

  // ---------- delete modal ----------
  openDelete(item: Item): void {
    this.deleteError.set(null);
    this.deleteTarget.set(item);
  }

  cancelDelete(): void {
    if (this.deleting()) return;
    this.deleteTarget.set(null);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    this.itemService.delete(target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        toast.success('Item deleted successfully');
        // لو مسحت آخر عنصر في الصفحة، ارجع صفحة
        if (this.items().length === 1 && this.pageNumber() > 1) {
          this.pageNumber.update((p) => p - 1);
        }
        this.load();
      },
      error: (err) => {
        this.deleting.set(false);
        this.deleteError.set(
          err?.error?.message ?? err?.error?.title ?? 'Could not delete the item.',
        );
        toast.error('Could not delete item');
      },
    });
  }
}
