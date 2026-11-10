import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  isDevMode,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, filter, map } from 'rxjs';
import { toast } from 'ngx-sonner';
import { CheckListDetail } from '../../../core/models/checklist-modal';
import {
  AuditCounts,
  AuditItem,
  AuditItemStatus,
  AuditResult,
  normalizeAuditResponse,
} from '../../../core/models/audit-modal';
import { ChecklistServices } from '../../../core/services/checklist-services';
import { DropDownServices, DropdownItem } from '../../../core/services/drop-down-services';
import { AuthService } from '../../../core/auth/auth-service/auth-service';
import {
  LazyDropdownComponent,
  LazyDropdownOption,
} from '../../../shared/ui/lazy-dropdown/lazy-dropdown.component';

type StatusPill = { label: string; value: AuditItemStatus | null };
type AuditOptionKey = 'brands' | 'models' | 'materials' | 'departments';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LazyDropdownComponent],
  selector: 'app-run-audit',
  templateUrl: './run-audit.component.html',
})
export class RunAuditComponent implements OnInit {
  readonly language = inject(AuthService).language;
  private static readonly MAX_SEARCH_LENGTH = 100;
  private static readonly MAX_SCAN_LENGTH = 128;
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(ChecklistServices);
  private readonly dropdowns = inject(DropDownServices);
  private readonly route = inject(ActivatedRoute);

  checkListId = signal('');
  closed = output<void>();

  // hard-coded: values must match the backend strings exactly
  readonly pills: StatusPill[] = [
    { label: 'All', value: null },
    { label: 'Pending', value: 'Pending' },
    { label: 'Checked', value: 'Checked' },
    { label: 'Missing', value: 'Missing' },
  ];

  private readonly search$ = new Subject<string>();
  private readonly filterKeys: readonly AuditOptionKey[] = [
    'brands',
    'models',
    'materials',
    'departments',
  ];
  private readonly filterSearchSubjects: Record<AuditOptionKey, Subject<string>> = {
    brands: new Subject<string>(),
    models: new Subject<string>(),
    materials: new Subject<string>(),
    departments: new Subject<string>(),
  };
  private readonly filterRequests: Partial<Record<AuditOptionKey, Subscription>> = {};
  private readonly pendingFilterLoads = new Set<AuditOptionKey>();
  private readonly filterPageSize = 10;
  private lastSearch = '';
  private loadSub?: Subscription;
  private headerSub?: Subscription;

  detail = signal<CheckListDetail | null>(null);
  items = signal<AuditItem[]>([]);
  counts = signal<AuditCounts>({ total: 0, pending: 0, checked: 0, missing: 0 });
  isReadOnly = signal(false);

  loading = signal(false);
  error = signal<string | null>(null);
  busyItemId = signal<string | null>(null); // row currently being updated
  scanning = signal(false);
  completing = signal(false);
  headerLoading = signal(false);
  confirmComplete = signal(false);

  status = signal<AuditItemStatus | null>(null);
  search = signal('');
  filtersExpanded = signal(false);
  itemIdFilter = signal('');
  codeFilter = signal('');
  capacityFilter = signal('');
  brandIdFilter = signal<number | null>(null);
  modelIdFilter = signal<number | null>(null);
  materialIdFilter = signal<number | null>(null);
  countryIdFilter = signal<number | null>(null);
  departmentIdFilter = signal<string | null>(null);
  filterSearch = signal<Record<AuditOptionKey, string>>({
    brands: '',
    models: '',
    materials: '',
    departments: '',
  });
  filterOptions = signal<Record<AuditOptionKey, DropdownItem[]>>({
    brands: [],
    models: [],
    materials: [],
    departments: [],
  });
  filterPages = signal<Record<AuditOptionKey, number>>({
    brands: 0,
    models: 0,
    materials: 0,
    departments: 0,
  });
  filterHasMore = signal<Record<AuditOptionKey, boolean>>({
    brands: false,
    models: false,
    materials: false,
    departments: false,
  });
  filterLoading = signal<Record<AuditOptionKey, boolean>>({
    brands: false,
    models: false,
    materials: false,
    departments: false,
  });
  countryOptions = signal<DropdownItem<string | number>[]>([]);
  countryLoading = signal(false);
  private countriesLoaded = false;
  scanCode = '';
  pageNumber = signal(1);
  pageSize = signal(10);
  totalPages = signal(1);
  totalCount = signal(0);

  /** progress = everything that is no longer pending */
  progress = computed(() => {
    const c = this.counts();
    return c.total ? Math.min(100, Math.round(((c.checked + c.missing) / c.total) * 100)) : 0;
  });
  canComplete = computed(
    () =>
      !!this.detail() &&
      !this.loading() &&
      !this.isReadOnly() &&
      this.counts().total > 0 &&
      this.counts().pending === 0,
  );

  constructor() {
    for (const key of this.filterKeys) {
      this.filterSearchSubjects[key]
        .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
        .subscribe((term) => this.loadFilterOptions(key, true, term));
    }
    this.search$.pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef)).subscribe((term) => {
      if (term === this.lastSearch) return;
      this.lastSearch = term;
      this.pageNumber.set(1);
      this.load();
    });
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => {
        this.checkListId.set(id);
        this.loadSub?.unsubscribe();
        this.headerSub?.unsubscribe();
        for (const key of this.filterKeys) {
          this.filterRequests[key]?.unsubscribe();
          delete this.filterRequests[key];
        }
        this.pendingFilterLoads.clear();
        this.lastSearch = '';
        this.search.set('');
        this.resetItemFilters(false);
        this.status.set(null);
        this.pageNumber.set(1);
        this.items.set([]);
        this.detail.set(null);
        this.loading.set(false);
        this.headerLoading.set(true);
        this.scanning.set(false);
        this.busyItemId.set(null);
        this.completing.set(false);
        this.confirmComplete.set(false);
        this.counts.set({ total: 0, pending: 0, checked: 0, missing: 0 });
        this.isReadOnly.set(false);
        this.loadHeader();
        this.load();
      });
  }

  private loadHeader(): void {
    const listId = this.checkListId();
    if (!listId) return;
    this.headerLoading.set(true);
    this.headerSub = this.service
      .getById(listId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (listId !== this.checkListId()) return;
          this.headerLoading.set(false);
          if (res?.succeeded === false || !res?.data) {
            this.error.set(res?.message || 'Could not load the check list.');
            return;
          }
          this.detail.set(res.data);
          for (const key of this.pendingFilterLoads) this.loadFilterOptions(key, true);
        },
        error: (err) => {
          if (listId !== this.checkListId()) return;
          this.headerLoading.set(false);
          this.error.set(this.responseMessage(err) ?? 'Could not load the check list.');
        },
      });
  }

  /** silent = refresh counts/rows without flashing the loading row */
  load(silent = false): void {
    const listId = this.checkListId();
    if (!listId) return;
    if (!silent) this.loading.set(true);
    this.error.set(null);
    this.loadSub?.unsubscribe();
    this.loadSub = this.service
      .auditItems(listId, {
        pageNumber: this.pageNumber(),
        pageSize: this.pageSize(),
        search: this.search(),
        status: this.status(),
        id: this.itemIdFilter().trim() || undefined,
        code: this.codeFilter().trim() || undefined,
        brandId: this.brandIdFilter(),
        modelId: this.modelIdFilter(),
        materialId: this.materialIdFilter(),
        countryId: this.countryIdFilter(),
        departmentId: this.departmentIdFilter(),
        capacity: this.capacityFilter().trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const page = normalizeAuditResponse(res);
          if (listId !== this.checkListId()) return;
          if (!page) {
            this.items.set([]);
            this.loading.set(false);
            this.error.set(this.responseMessage(res) ?? 'Could not load audit items.');
            return;
          }
          this.items.set(page.items);
          this.counts.set(page.counts);
          this.isReadOnly.set(page.isReadOnly);
          this.totalPages.set(page.totalPages);
          this.totalCount.set(page.totalCount);
          this.loading.set(false);
        },
        error: (err) => {
          if (listId !== this.checkListId()) return;
          this.loading.set(false);
          this.error.set(this.responseMessage(err) ?? 'Could not load audit items.');
        },
      });
  }

  setStatus(value: AuditItemStatus | null): void {
    if (this.status() === value) return;
    this.status.set(value);
    this.pageNumber.set(1);
    this.load();
  }

  onSearch(term: string): void {
    const safeTerm = term.slice(0, RunAuditComponent.MAX_SEARCH_LENGTH);
    this.search.set(safeTerm);
    this.search$.next(safeTerm.trim());
  }

  toggleFilters(): void {
    const expanded = !this.filtersExpanded();
    this.filtersExpanded.set(expanded);
    if (expanded) this.loadCountries();
  }

  applyFilters(): void {
    this.pageNumber.set(1);
    this.load();
  }

  resetFilters(): void {
    this.resetItemFilters(true);
  }

  private resetItemFilters(reload: boolean): void {
    this.itemIdFilter.set('');
    this.codeFilter.set('');
    this.capacityFilter.set('');
    this.brandIdFilter.set(null);
    this.modelIdFilter.set(null);
    this.materialIdFilter.set(null);
    this.countryIdFilter.set(null);
    this.departmentIdFilter.set(null);
    this.pageNumber.set(1);
    if (reload && this.checkListId()) this.load();
  }

  onFilterSearch(key: AuditOptionKey, term: string): void {
    const value = term.trim().slice(0, 100);
    this.filterSearch.update((current) => ({ ...current, [key]: value }));
    this.filterSearchSubjects[key].next(value);
  }

  filterDropdownOptions(key: AuditOptionKey): LazyDropdownOption[] {
    return this.toDropdownOptions(this.filterOptions()[key]);
  }

  countryDropdownOptions(): LazyDropdownOption[] {
    return this.toDropdownOptions(this.countryOptions());
  }

  private toDropdownOptions(items: DropdownItem<string | number>[]): LazyDropdownOption[] {
    return items.map((item) => ({
      id: item.id,
      name: item.title?.trim() || item.name?.trim() || String(item.id),
    }));
  }

  loadFilterOptions(key: AuditOptionKey, reset = false, search = this.filterSearch()[key]): void {
    const businessId = this.detail()?.businessId;
    if (!businessId) {
      this.pendingFilterLoads.add(key);
      return;
    }
    this.pendingFilterLoads.delete(key);
    if (key === 'models' && !this.brandIdFilter()) return;
    const loading = this.filterLoading()[key];
    const hasMore = this.filterHasMore()[key];
    if ((!reset && loading) || (!reset && !hasMore)) return;

    const pageNumber = reset ? 1 : this.filterPages()[key] + 1;
    this.filterLoading.update((state) => ({ ...state, [key]: true }));
    this.filterRequests[key]?.unsubscribe();
    const query: Record<string, string | number> = {
      businessId,
      pageNumber,
      pageSize: this.filterPageSize,
      search,
    };
    if (key === 'models' && this.brandIdFilter()) query['brandId'] = this.brandIdFilter()!;

    const request =
      key === 'brands'
        ? this.dropdowns.brands(query)
        : key === 'models'
          ? this.dropdowns.itemModels(query)
          : key === 'materials'
            ? this.dropdowns.materials(query)
            : this.dropdowns.departments(query);

    this.filterRequests[key] = request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (isDevMode()) console.log(`[Audit ${key} dropdown response]`, { query, response });
        const page = response?.data;
        if (!Array.isArray(page?.data)) {
          this.filterLoading.update((state) => ({ ...state, [key]: false }));
          this.error.set(`Could not load ${key}.`);
          return;
        }
        this.filterOptions.update((options) => ({
          ...options,
          [key]: this.mergeFilterOptions(key, options[key], page.data, reset),
        }));
        this.filterPages.update((pages) => ({ ...pages, [key]: page.currentPage ?? pageNumber }));
        this.filterHasMore.update((pages) => ({ ...pages, [key]: !!page.hasNextPage }));
        this.filterLoading.update((state) => ({ ...state, [key]: false }));
      },
      error: () => {
        this.filterLoading.update((state) => ({ ...state, [key]: false }));
        this.error.set(`Could not load ${key}.`);
      },
    });
  }

  private mergeFilterOptions(
    key: AuditOptionKey,
    current: DropdownItem[],
    incoming: DropdownItem[],
    reset: boolean,
  ): DropdownItem[] {
    const selectedId = this.selectedFilterId(key);
    const selected = current.find((option) => String(option.id) === selectedId);
    const combined = reset
      ? [...(selected ? [selected] : []), ...incoming]
      : [...current, ...incoming];
    return [...new Map(combined.map((option) => [String(option.id), option])).values()];
  }

  private selectedFilterId(key: AuditOptionKey): string | null {
    const id =
      key === 'brands'
        ? this.brandIdFilter()
        : key === 'models'
          ? this.modelIdFilter()
          : key === 'materials'
            ? this.materialIdFilter()
            : this.departmentIdFilter();
    return id?.toString() ?? null;
  }

  loadCountries(): void {
    if (this.countriesLoaded || this.countryLoading()) return;
    this.countryLoading.set(true);
    this.dropdowns
      .staticLookups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lookups) => {
          this.countryOptions.set(lookups.countries ?? []);
          this.countriesLoaded = true;
          this.countryLoading.set(false);
        },
        error: () => {
          this.countryLoading.set(false);
          this.error.set('Could not load countries.');
        },
      });
  }

  selectNumericFilter(
    field: 'brand' | 'model' | 'material' | 'country',
    option: LazyDropdownOption,
  ): void {
    const value = Number(option.id);
    if (!Number.isSafeInteger(value) || value <= 0) return;
    if (field === 'brand') {
      this.brandIdFilter.set(value);
      this.modelIdFilter.set(null);
      this.filterOptions.update((options) => ({ ...options, models: [] }));
      this.filterPages.update((pages) => ({ ...pages, models: 0 }));
      this.filterHasMore.update((pages) => ({ ...pages, models: false }));
    } else if (field === 'model') this.modelIdFilter.set(value);
    else if (field === 'material') this.materialIdFilter.set(value);
    else this.countryIdFilter.set(value);
  }

  onDepartmentSelected(option: LazyDropdownOption): void {
    this.departmentIdFilter.set(String(option.id));
  }

  clearNumericFilter(field: 'brand' | 'model' | 'material' | 'country'): void {
    if (field === 'brand') {
      this.brandIdFilter.set(null);
      this.modelIdFilter.set(null);
      this.filterOptions.update((options) => ({ ...options, models: [] }));
      this.filterPages.update((pages) => ({ ...pages, models: 0 }));
      this.filterHasMore.update((pages) => ({ ...pages, models: false }));
    } else if (field === 'model') this.modelIdFilter.set(null);
    else if (field === 'material') this.materialIdFilter.set(null);
    else this.countryIdFilter.set(null);
  }

  clearDepartmentFilter(): void {
    this.departmentIdFilter.set(null);
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

  // ---------- scan (barcode scanners send Enter after the code) ----------
  onScan(): void {
    const code = this.scanCode.trim();
    if (!code || this.scanning() || this.isReadOnly() || !this.detail()) return;
    if (code.length > RunAuditComponent.MAX_SCAN_LENGTH || /[\u0000-\u001f\u007f]/.test(code)) {
      toast.error('Enter a valid code (up to 128 characters).');
      return;
    }

    const listId = this.checkListId();
    this.scanning.set(true);
    this.service
      .scan(listId, code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (listId !== this.checkListId()) return;
          this.scanning.set(false);
          if (res?.succeeded === false) {
            this.scanCode = '';
            toast.error(res.message || 'Could not register this code');
            return;
          }
          this.scanCode = '';
          const updated = res.data;
          // update the row in place when it's on screen, then refresh the counts
          if (updated) {
            this.items.update((rows) =>
              rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
            );
          }
          toast.success(updated?.itemName ? `${updated.itemName} checked` : 'Item checked');
          this.load(true);
        },
        error: (err) => {
          if (listId !== this.checkListId()) return;
          this.scanning.set(false);
          this.scanCode = '';
          toast.error(this.responseMessage(err) ?? 'Could not register this code');
        },
      });
  }

  // ---------- manual result: Checked | Missing | Pending (reset) ----------
  setResult(item: AuditItem, result: AuditResult): void {
    if (this.busyItemId() || this.isReadOnly() || !this.detail()) return;
    const listId = this.checkListId();
    this.busyItemId.set(item.id);
    this.service
      .setResult(listId, item.id, result)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (listId !== this.checkListId()) return;
          this.busyItemId.set(null);
          if (response?.succeeded === false) {
            toast.error(response.message || 'Could not update the item');
            return;
          }
          this.items.update((rows) =>
            rows.map((r) => (r.id === item.id ? { ...r, status: result } : r)),
          );
          this.load(true);
        },
        error: (err) => {
          if (listId !== this.checkListId()) return;
          this.busyItemId.set(null);
          toast.error(this.responseMessage(err) ?? 'Could not update the item');
        },
      });
  }

  // ---------- complete ----------
  askComplete(): void {
    if (this.canComplete()) this.confirmComplete.set(true);
  }

  cancelComplete(): void {
    if (!this.completing()) this.confirmComplete.set(false);
  }

  complete(): void {
    if (this.completing() || !this.canComplete()) return;
    const listId = this.checkListId();
    this.completing.set(true);
    this.service
      .complete(listId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (listId !== this.checkListId()) return;
          this.completing.set(false);
          this.confirmComplete.set(false);
          if (response?.succeeded === false) {
            toast.error(response.message || 'Could not complete the audit');
            return;
          }
          this.isReadOnly.set(true);
          toast.success('Audit completed');
          this.loadHeader();
          this.load(true); // comes back read-only
        },
        error: (err) => {
          if (listId !== this.checkListId()) return;
          this.completing.set(false);
          this.confirmComplete.set(false);
          // 400 when pending items remain
          toast.error(this.responseMessage(err) ?? 'Could not complete the audit');
        },
      });
  }

  back(): void {
    this.closed.emit();
  }

  private responseMessage(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const body = 'error' in response ? response.error : response;
    if (!body || typeof body !== 'object') return null;
    const record = body as { message?: unknown; errors?: unknown };
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (Array.isArray(record.errors)) {
      const messages = record.errors.filter((value): value is string => typeof value === 'string');
      if (messages.length) return messages.join(' ');
    }
    return null;
  }
}
