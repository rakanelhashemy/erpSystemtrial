import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  DepreciationItemRow,
  DepreciationGroupRow,
  DepreciationSummary,
  DepreciationReportQuery,
} from '../../core/models/depreciation-report-modal';
import { BusinessContextService } from '../../core/services/business-context.service';
import { DepreciationReportServices } from '../../core/services/depreciation-report-services';
import {
  DropDownServices,
  DropdownItem,
  StaticLookups,
} from '../../core/services/drop-down-services';
import {
  LazyDropdownOption,
  LazyDropdownComponent,
} from '../../shared/ui/lazy-dropdown/lazy-dropdown.component';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ReportFilters {
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
  includeChildGroups: boolean;
}

const emptyFilters = (): ReportFilters => ({
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
  includeChildGroups: false,
});

type DdKey = 'businesses' | 'brands' | 'models' | 'materials' | 'groups' | 'departments';
type FilterField = 'brandId' | 'modelId' | 'materialId' | 'groupId' | 'departmentId';
type ReportView = 'items' | 'groups';

interface DdFilterConfig {
  key: Exclude<DdKey, 'businesses'>;
  field: FilterField;
  label: string;
  placeholder: string;
  numeric: boolean;
}

const DD_KEYS: DdKey[] = ['businesses', 'brands', 'models', 'materials', 'groups', 'departments'];

@Component({
  imports: [FormsModule, DecimalPipe, LazyDropdownComponent],
  selector: 'app-depreciation-reports',
  styleUrl: './depreciation-reports.component.css',
  templateUrl: './depreciation-reports.component.html',
})
export class DepreciationReportsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly report = inject(DepreciationReportServices);
  private readonly dd = inject(DropDownServices);
  private readonly businessCtx = inject(BusinessContextService);

  readonly searchDebounceMs = 400;
  readonly ddPageSize = 10;

  readonly ddFilters: DdFilterConfig[] = [
    {
      key: 'brands',
      field: 'brandId',
      label: 'Mark / Brand',
      placeholder: 'All brands',
      numeric: true,
    },
    { key: 'models', field: 'modelId', label: 'Model', placeholder: 'All models', numeric: true },
    {
      key: 'materials',
      field: 'materialId',
      label: 'Material',
      placeholder: 'All materials',
      numeric: true,
    },
    {
      key: 'departments',
      field: 'departmentId',
      label: 'Department',
      placeholder: 'All departments',
      numeric: false,
    },
    { key: 'groups', field: 'groupId', label: 'Group', placeholder: 'All groups', numeric: false },
  ];

  private tableSearch$ = new Subject<string>();
  private lastTableSearch = '';
  private loadSub?: Subscription;
  private readonly ddSubs: Partial<Record<DdKey, Subscription>> = {};
  private readonly locationSubs: Partial<Record<number, Subscription>> = {};
  private readonly ddSearch$ = Object.fromEntries(
    DD_KEYS.map((k) => [k, new Subject<string>()]),
  ) as Record<DdKey, Subject<string>>;

  // ---------- business ----------
  businessId = signal('');
  selectedBusiness = signal<DropdownItem | null>(null);

  // ---------- view / data ----------
  view = signal<ReportView>('items');
  itemRows = signal<DepreciationItemRow[]>([]);
  groupRows = signal<DepreciationGroupRow[]>([]);
  summary = signal<DepreciationSummary | null>(null);
  defaultCurrency = signal('');
  loading = signal(false);
  error = signal<string | null>(null);

  asOfDate = signal('');
  search = signal('');
  pageNumber = signal(1);
  pageSize = signal(10);
  totalPages = signal(1);
  totalCount = signal(0);

  filtersOpen = signal(false);
  filters: ReportFilters = emptyFilters();
  private applied = signal<ReportFilters>(emptyFilters());

  activeFiltersCount = computed(() => {
    const f = this.applied();
    const e = emptyFilters();
    return (Object.keys(e) as (keyof ReportFilters)[]).filter((key) =>
      typeof f[key] === 'string' ? f[key].trim() !== '' : f[key] !== e[key],
    ).length;
  });

  from = computed(() =>
    this.totalCount() === 0 ? 0 : (this.pageNumber() - 1) * this.pageSize() + 1,
  );
  to = computed(() => Math.min(this.pageNumber() * this.pageSize(), this.totalCount()));

  // ---------- dropdown state ----------
  ddOptions = signal<Record<string, DropdownItem[]>>({});
  ddPages = signal<Record<string, number>>({});
  ddHasMore = signal<Record<string, boolean>>({});
  ddLoading = signal<Record<string, boolean>>({});
  ddSearch = signal<Record<string, string>>({});

  locationFilterLevels = signal<DropdownItem[][]>([[]]);
  locationSelectedIds = signal<string[]>([]);
  locationLevelLoading = signal<Record<number, boolean>>({});
  locationLevelPages = signal<Record<number, number>>({});
  locationLevelHasMore = signal<Record<number, boolean>>({});
  lookups = signal<StaticLookups>({ countries: [], currencies: [], genders: [] });
  private readonly mappedDdOptions = computed<Record<string, LazyDropdownOption[]>>(() => {
    const lists = this.ddOptions();
    const selectedBusiness = this.selectedBusiness();
    return Object.fromEntries(
      DD_KEYS.map((key) => {
        let options = lists[key] ?? [];
        if (
          key === 'businesses' &&
          selectedBusiness &&
          !options.some((option) => option.id === selectedBusiness.id)
        ) {
          options = [selectedBusiness, ...options];
        }
        return [
          key,
          options.map((option) => ({ id: option.id, name: option.title ?? option.name })),
        ];
      }),
    );
  });
  private readonly mappedLocationOptions = computed(() =>
    this.locationFilterLevels().map((level) =>
      level.map((location) => ({ id: location.id, name: location.title ?? location.name })),
    ),
  );

  constructor() {
    // Shared business changed → reset everything that belongs to the old business
    effect(() => {
      const selection = this.businessCtx.selectedBusiness();
      if (selection && selection.id !== untracked(() => this.businessId())) {
        untracked(() => {
          this.businessId.set(selection.id);
          this.selectedBusiness.set(selection);
          this.resetStateForBusiness();
          this.loadLookups();
          this.load();
        });
      }
    });

    this.tableSearch$
      .pipe(debounceTime(this.searchDebounceMs), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => {
        const term = this.search().trim();
        if (term === this.lastTableSearch) return;
        this.lastTableSearch = term;
        this.pageNumber.set(1);
        this.load();
      });

    for (const key of DD_KEYS) {
      this.ddSearch$[key]
        .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed())
        .subscribe(() => this.loadDropdown(key, true));
    }

    this.destroyRef.onDestroy(() => {
      this.loadSub?.unsubscribe();
      Object.values(this.ddSubs).forEach((subscription) => subscription?.unsubscribe());
      Object.values(this.locationSubs).forEach((subscription) => subscription?.unsubscribe());
    });
  }

  private resetStateForBusiness(): void {
    this.loadSub?.unsubscribe();
    this.loadSub = undefined;
    this.cancelLocationRequestsFrom(0);
    this.filters = emptyFilters();
    this.applied.set(emptyFilters());
    this.search.set('');
    this.lastTableSearch = '';
    this.pageNumber.set(1);
    this.itemRows.set([]);
    this.groupRows.set([]);
    this.summary.set(null);
    this.totalCount.set(0);
    this.totalPages.set(1);

    // clear every dropdown that depends on the business (keep the business list itself)
    for (const key of DD_KEYS) {
      if (key === 'businesses') continue;
      this.ddSubs[key]?.unsubscribe();
      this.ddOptions.update((s) => ({ ...s, [key]: [] }));
      this.ddPages.update((s) => ({ ...s, [key]: 0 }));
      this.ddHasMore.update((s) => ({ ...s, [key]: false }));
      this.ddLoading.update((s) => ({ ...s, [key]: false }));
      this.ddSearch.update((s) => ({ ...s, [key]: '' }));
    }
    this.locationFilterLevels.set([[]]);
    this.locationSelectedIds.set([]);
    this.locationLevelLoading.set({});
    this.locationLevelPages.set({});
    this.locationLevelHasMore.set({});
  }

  private loadLookups(): void {
    this.dd
      .staticLookups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lookups) => this.lookups.set(lookups),
        error: () => this.error.set('Could not load filter options.'),
      });
  }

  // ---------- report data ----------
  load(): void {
    const businessId = this.businessId();
    if (!businessId) return;

    this.loading.set(true);
    this.error.set(null);
    this.summary.set(null);
    if (this.view() === 'items') this.itemRows.set([]);
    else this.groupRows.set([]);
    this.loadSub?.unsubscribe();

    const f = this.applied();
    const query: DepreciationReportQuery = {
      ...f,
      businessId,
      asOfDate: this.asOfDate(),
      search: this.search(),
      pageNumber: this.pageNumber(),
      pageSize: this.pageSize(),
      scraping: f.scraping ? true : null,
      includeChildGroups: f.includeChildGroups ? true : null,
    };

    const onError = (err?: any) => {
      this.loading.set(false);
      this.error.set(this.getApiError(err) ?? 'Could not load the depreciation report.');
    };

    const isValidPage = (
      page: any,
    ): page is { data: unknown[]; totalPages: number; totalCount: number } =>
      !!page && Array.isArray(page.data);

    if (this.view() === 'items') {
      this.loadSub = this.report
        .items(query)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            const data = response?.data;
            if (response?.succeeded === false || !data?.summary || !isValidPage(data?.items)) {
              onError(response);
              return;
            }
            this.itemRows.set(data.items.data as DepreciationItemRow[]);
            this.applyMeta(data.summary, data.defaultCurrency, data.asOfDate, data.items);
          },
          error: onError,
        });
    } else {
      this.loadSub = this.report
        .groups(query)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            const data = response?.data;
            if (response?.succeeded === false || !data?.summary || !isValidPage(data?.groups)) {
              onError(response);
              return;
            }
            this.groupRows.set(data.groups.data as DepreciationGroupRow[]);
            this.applyMeta(data.summary, data.defaultCurrency, data.asOfDate, data.groups);
          },
          error: onError,
        });
    }
  }

  private applyMeta(
    summary: DepreciationSummary,
    currency: string,
    asOf: string,
    page: { totalPages: number; totalCount: number },
  ): void {
    this.summary.set(summary);
    this.defaultCurrency.set(currency);
    if (!this.asOfDate()) this.asOfDate.set(asOf); // show the server's default date
    this.totalPages.set(Math.max(1, page.totalPages || 1));
    this.totalCount.set(Math.max(0, page.totalCount || 0));
    this.loading.set(false);
  }

  private getApiError(error: any): string | null {
    const body = error?.error ?? error;
    const errors = body?.errors;
    const detail = Array.isArray(errors)
      ? errors.filter(Boolean).join(' ')
      : errors && typeof errors === 'object'
        ? Object.values(errors)
            .flatMap((value) => (Array.isArray(value) ? value : [value]))
            .filter(Boolean)
            .join(' ')
        : typeof errors === 'string'
          ? errors
          : '';
    return body?.message || body?.title || detail || null;
  }

  setView(view: ReportView): void {
    if (this.view() === view) return;
    this.view.set(view);
    this.pageNumber.set(1);
    this.load();
  }

  onAsOfDateChange(value: string): void {
    this.asOfDate.set(value);
    this.pageNumber.set(1);
    this.load();
  }

  viewGroupItems(row: DepreciationGroupRow): void {
    if (!row.groupId) return;
    this.filters = { ...this.filters, groupId: row.groupId };
    this.applied.set({ ...this.filters });
    this.ddOptions.update((options) => ({
      ...options,
      groups: [
        { id: row.groupId!, name: row.groupName },
        ...(options['groups'] ?? []).filter((group) => String(group.id) !== row.groupId),
      ],
    }));
    this.filtersOpen.set(true);
    this.view.set('items');
    this.pageNumber.set(1);
    this.load();
  }

  pct(accumulated: number, original: number): number {
    return original > 0 ? Math.min(100, Math.max(0, (accumulated / original) * 100)) : 0;
  }

  isFullyDepreciated(row: DepreciationItemRow): boolean {
    const endDate = row.depreciationEndDate?.slice(0, 10);
    const asOfDate = this.asOfDate();
    return !!endDate && !!asOfDate && endDate <= asOfDate;
  }

  // ---------- generic lazy dropdowns ----------
  ddOptionsFor(key: DdKey): LazyDropdownOption[] {
    return this.mappedDdOptions()[key] ?? [];
  }

  ensureDropdownLoaded(key: DdKey): void {
    if ((this.ddPages()[key] ?? 0) > 0 || this.ddLoading()[key]) return;
    this.loadDropdown(key, true);
  }

  loadDropdown(key: DdKey, reset = false): void {
    const businessId = this.businessId();
    if (key !== 'businesses' && !businessId) return;
    if (!reset && (this.ddLoading()[key] || (this.ddPages()[key] && !this.ddHasMore()[key]))) {
      return;
    }

    const pageNumber = reset ? 1 : (this.ddPages()[key] ?? 0) + 1;
    const search = this.ddSearch()[key]?.trim() ?? '';
    const base = { pageNumber, pageSize: this.ddPageSize, search };
    const scoped = { ...base, businessId };

    const request =
      key === 'businesses'
        ? this.dd.businesses(base)
        : key === 'brands'
          ? this.dd.brands(scoped)
          : key === 'models'
            ? this.dd.itemModels(scoped)
            : key === 'materials'
              ? this.dd.materials(scoped)
              : key === 'groups'
                ? this.dd.groups(scoped)
                : this.dd.departments(scoped);

    this.ddSubs[key]?.unsubscribe();
    this.patch(this.ddLoading, key, true);
    this.ddSubs[key] = request.subscribe({
      next: (res) => {
        const page = res?.data;
        if (!page || !Array.isArray(page.data)) {
          this.patch(this.ddLoading, key, false);
          this.error.set('The filter options response was invalid.');
          return;
        }
        this.ddOptions.update((s) => ({
          ...s,
          [key]: reset ? page.data : [...(s[key] ?? []), ...page.data],
        }));
        this.patch(this.ddPages, key, page.currentPage);
        this.patch(this.ddHasMore, key, page.hasNextPage);
        this.patch(this.ddLoading, key, false);
      },
      error: () => {
        this.patch(this.ddLoading, key, false);
        this.error.set('Could not load filter options.');
      },
    });
  }

  onDropdownSearch(key: DdKey, term: string): void {
    this.patch(this.ddSearch, key, term);
    this.ddSearch$[key].next(term.trim());
  }

  private patch<T>(state: WritableSignal<Record<string, T>>, key: string, value: T): void {
    state.update((s) => ({ ...s, [key]: value }));
  }

  // business picker
  selectBusiness(option: LazyDropdownOption): void {
    const item = (this.ddOptions()['businesses'] ?? []).find(
      (b) => String(b.id) === String(option.id),
    );
    if (item) this.businessCtx.select(item);
  }

  // filter pickers
  selectFilter(cfg: DdFilterConfig, option: LazyDropdownOption): void {
    (this.filters as unknown as Record<string, unknown>)[cfg.field] = cfg.numeric
      ? Number(option.id)
      : String(option.id);
  }

  clearFilter(cfg: DdFilterConfig): void {
    (this.filters as unknown as Record<string, unknown>)[cfg.field] = null;
  }

  // ---------- location cascade ----------
  locationLevelOptions(level: number): LazyDropdownOption[] {
    return this.mappedLocationOptions()[level] ?? [];
  }

  private cancelLocationRequestsFrom(level: number): void {
    for (const key of Object.keys(this.locationSubs).map(Number)) {
      if (key < level) continue;
      this.locationSubs[key]?.unsubscribe();
      delete this.locationSubs[key];
    }
    this.locationLevelLoading.update((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, value]) => [key, Number(key) < level && value]),
      ),
    );
    this.locationLevelPages.update((pages) =>
      Object.fromEntries(Object.entries(pages).filter(([key]) => Number(key) < level)),
    );
    this.locationLevelHasMore.update((pages) =>
      Object.fromEntries(Object.entries(pages).filter(([key]) => Number(key) < level)),
    );
  }

  loadLocationLevel(level: number, parentId: string | null, reset = false, loadMore = false): void {
    if (!this.businessId() || (!reset && this.locationLevelLoading()[level])) return;
    if (!reset && !loadMore && this.locationLevelPages()[level]) return;
    if (loadMore && !this.locationLevelHasMore()[level]) return;

    if (reset) {
      this.cancelLocationRequestsFrom(level);
      this.locationFilterLevels.update((levels) => levels.slice(0, level));
    }

    const pageNumber = loadMore ? (this.locationLevelPages()[level] ?? 0) + 1 : 1;
    this.locationSubs[level]?.unsubscribe();
    this.locationLevelLoading.update((state) => ({ ...state, [level]: true }));
    this.locationSubs[level] = this.dd
      .locations({
        businessId: this.businessId(),
        parentId,
        pageNumber,
        pageSize: this.ddPageSize,
        search: '',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const options = response?.data?.data;
          if (!Array.isArray(options)) {
            this.locationLevelLoading.update((state) => ({ ...state, [level]: false }));
            this.error.set('The locations response was invalid.');
            return;
          }
          this.locationFilterLevels.update((levels) => {
            const currentOptions = levels[level] ?? [];
            const next = levels.slice(0, level);
            next[level] = reset ? options : [...currentOptions, ...options];
            return next;
          });
          this.locationLevelPages.update((pages) => ({
            ...pages,
            [level]: response.data.currentPage ?? pageNumber,
          }));
          this.locationLevelHasMore.update((pages) => ({
            ...pages,
            [level]: !!response.data.hasNextPage,
          }));
          this.locationLevelLoading.update((s) => ({ ...s, [level]: false }));
        },
        error: () => {
          this.locationLevelLoading.update((s) => ({ ...s, [level]: false }));
          this.error.set('Could not load filter options.');
        },
      });
  }

  selectLocationLevel(level: number, location: LazyDropdownOption): void {
    const id = String(location.id);
    this.locationSelectedIds.update((selected) => {
      const next = selected.slice(0, level);
      next[level] = id;
      return next;
    });
    this.filters.locationId = id;
    this.cancelLocationRequestsFrom(level + 1);
    this.locationFilterLevels.update((levels) => levels.slice(0, level + 1));
    this.loadLocationLevel(level + 1, id, true);
  }

  clearLocationLevel(level: number): void {
    this.cancelLocationRequestsFrom(level);
    this.locationFilterLevels.update((levels) => (level === 0 ? [[]] : levels.slice(0, level)));
    this.locationSelectedIds.update((selected) => selected.slice(0, level));
    this.filters.locationId = this.locationSelectedIds().at(-1) ?? null;
  }

  // ---------- search / filters / paging ----------
  onSearch(term: string): void {
    this.search.set(term);
    this.tableSearch$.next(term);
  }

  toggleFilters(): void {
    this.filtersOpen.update((v) => !v);
  }

  applyFilters(): void {
    const validationError = this.validateFilters(this.filters);
    if (validationError) {
      this.error.set(validationError);
      return;
    }
    this.applied.set({ ...this.filters });
    this.pageNumber.set(1);
    this.load();
  }

  resetFilters(): void {
    this.cancelLocationRequestsFrom(0);
    this.filters = emptyFilters();
    this.locationSelectedIds.set([]);
    this.locationFilterLevels.set([[]]);
    this.locationLevelPages.set({});
    this.locationLevelHasMore.set({});
    this.applyFilters();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(+size);
    this.pageNumber.set(1);
    this.load();
  }

  prev(): void {
    if (this.pageNumber() <= 1) return;
    this.pageNumber.update((page) => page - 1);
    this.load();
  }

  next(): void {
    if (this.pageNumber() >= this.totalPages()) return;
    this.pageNumber.update((page) => page + 1);
    this.load();
  }

  private validateFilters(filters: ReportFilters): string | null {
    const prices = [filters.fromPrice, filters.toPrice].filter(
      (value): value is number => value !== null,
    );
    if (prices.some((value) => !Number.isFinite(value) || value < 0)) {
      return 'Prices must be valid non-negative numbers.';
    }
    if (
      filters.fromPrice !== null &&
      filters.toPrice !== null &&
      filters.fromPrice > filters.toPrice
    ) {
      return 'Price from must be less than or equal to price to.';
    }
    if (
      filters.fromWorkingDate &&
      filters.toWorkingDate &&
      filters.fromWorkingDate > filters.toWorkingDate
    ) {
      return 'Working date from must be before or equal to working date to.';
    }
    if (
      filters.fromDepreciationDate &&
      filters.toDepreciationDate &&
      filters.fromDepreciationDate > filters.toDepreciationDate
    ) {
      return 'Depreciation date from must be before or equal to depreciation date to.';
    }
    return null;
  }
}
