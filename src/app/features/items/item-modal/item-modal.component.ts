import { DecimalPipe } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, map, Observable, startWith, Subject, Subscription } from 'rxjs';
import { toast } from 'ngx-sonner';
import {
  DropDownServices,
  DropdownItem,
  ItemFormLookups,
  StaticLookups,
} from '../../../core/services/drop-down-services';
import { ItemRequest } from '../../../core/models/items-modal';
import { ItemsServices } from '../../../core/services/items-services';
import { toImageUrl } from '../../../core/config/image-url';
import {
  LazyDropdownComponent,
  LazyDropdownOption,
} from '../../../shared/ui/lazy-dropdown/lazy-dropdown.component';

type TabId = 'general' | 'specs' | 'financials';

@Component({
  selector: 'app-item-modal',
  imports: [ReactiveFormsModule, DecimalPipe, LazyDropdownComponent],
  templateUrl: './item-modal.component.html',
  host: { '(document:keydown.escape)': 'close()' },
})
export class ItemModalComponent implements OnInit {
  private readonly service = inject(ItemsServices);
  private readonly dropdownService = inject(DropDownServices);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // ---------- inputs / outputs (data comes from the parent, no duplicate requests) ----------
  /** When set, the modal opens in edit mode and loads this item. */
  itemId = input<string | null>(null);
  business = input<DropdownItem | null>(null);
  /** Existing item names (optional). Typing a name that isn't here sends it as NewItemName. */
  itemNames = input<DropdownItem[]>([]);
  lookups = input<StaticLookups>({ countries: [], currencies: [], genders: [] });

  private readonly dropdownKeys = [
    'itemNames',
    'brands',
    'models',
    'materials',
    'groups',
    'departments',
  ];
  private readonly dropdownSearchSubjects: Record<string, Subject<string>> = Object.fromEntries(
    this.dropdownKeys.map((key) => [key, new Subject<string>()]),
  );
  private readonly dropdownRequests: Record<string, Subscription> = {};
  private readonly loadedDropdownDetails: Record<string, { id: string | number; name: string }> =
    {};
  private formItemNames: DropdownItem<number>[] = [];
  readonly modalDropdownOptions = signal<Record<string, LazyDropdownOption[]>>({});
  readonly modalDropdownPages = signal<Record<string, number>>({});
  readonly modalDropdownHasMore = signal<Record<string, boolean>>({});
  readonly modalDropdownLoading = signal<Record<string, boolean>>({});
  readonly modalDropdownSearch = signal<Record<string, string>>({});
  readonly newDropdownNames = signal<Record<string, string>>({});
  readonly modalDropdownPageSize = 10;
  readonly locationLevels = signal<DropdownItem[][]>([[]]);
  readonly selectedLocationIds = signal<string[]>([]);
  readonly locationLevelLoading = signal<Record<number, boolean>>({});

  closed = output<void>();
  saved = output<void>();

  // ---------- config ----------
  /** Items priced in this currency don't need an exchange rate. */
  readonly baseCurrency = 'EGP';
  readonly maxCopies = 50;

  readonly tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: 'General & Media' },
    { id: 'specs', label: 'Specs & Classification' },
    { id: 'financials', label: 'Financials' },
  ];

  // which controls live in which tab (used to jump to the tab that has an error)
  private readonly tabControls: Record<TabId, string[]> = {
    general: [
      'name',
      'price',
      'currencyId',
      'exchangeRate',
      'departmentId',
      'quantity',
      'description',
    ],
    specs: [
      'serialNumber',
      'brandId',
      'modelId',
      'materialId',
      'countryId',
      'capacity',
      'dimensions',
      'groupId',
      'locationId',
    ],
    financials: ['workingDate', 'depreciationRate', 'depreciationYears', 'depreciationDate'],
  };

  // ---------- state ----------
  activeTab = signal<TabId>('general');
  itemNameSuggestionsOpen = signal(false);
  saving = signal(false);
  loadingItem = signal(false);
  private loadedItemNameId: number | null = null;
  private loadedItemName = '';
  readonly selectedItemNameId = signal<number | null>(null);
  isEdit = computed(() => !!this.itemId());
  status = signal('');
  submitted = signal(false);

  imageFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);

  // ---------- form ----------
  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    price: this.fb.control<number | null>(null, Validators.min(0)),
    currencyId: this.fb.control<number | null>(null),
    exchangeRate: this.fb.control<number | null>(null, Validators.min(0)),
    departmentId: this.fb.control<string | null>(null),
    quantity: [1, [Validators.required, Validators.min(1)]],
    description: [''],

    serialNumber: [''],
    brandId: this.fb.control<number | null>(null),
    modelId: this.fb.control<number | null>(null),
    materialId: this.fb.control<number | null>(null),
    countryId: this.fb.control<number | null>(null),
    capacity: [''],
    dimensions: [''],
    groupId: this.fb.control<string | null>(null),
    locationId: this.fb.control<string | null>(null),

    workingDate: [''],
    depreciationRate: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(100),
    ]),
    depreciationYears: this.fb.control<number | null>(null, Validators.min(1)),
    depreciationDate: [''],
    copyCount: [1, [Validators.required, Validators.min(1), Validators.max(this.maxCopies)]],
  });

  private values = toSignal(
    this.form.valueChanges.pipe(
      map(() => this.form.getRawValue()),
      startWith(this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  // ---------- currency conversion ----------
  selectedCurrency = computed(
    () => this.lookups().currencies.find((c) => c.id === this.values().currencyId) ?? null,
  );
  needsConversion = computed(() => {
    const c = this.selectedCurrency();
    return !!c && c.name !== this.baseCurrency;
  });
  convertedTotal = computed(() => {
    const v = this.values();
    if (!this.needsConversion() || !v.price || !v.exchangeRate) return null;
    return v.price * v.exchangeRate * (v.quantity || 1);
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearImage());
    for (const [key, search$] of Object.entries(this.dropdownSearchSubjects)) {
      search$
        .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.loadModalDropdown(key, true));
    }
  }

  ngOnInit(): void {
    this.loadModalDropdowns();
    const id = this.itemId();
    if (!id) return;

    this.loadingItem.set(true);
    this.service
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.patchForm(res);
          this.loadingItem.set(false);
        },
        error: () => {
          this.loadingItem.set(false);
          this.status.set('Could not load the item.');
          toast.error('Could not load item');
        },
      });
  }

  /** Accepts either the item itself or a { data: item } wrapper. Adjust keys if your API differs. */
  private patchForm(res: unknown): void {
    const d = ((res as { data?: unknown } | null)?.data ?? res ?? {}) as Record<string, any>;
    this.loadedItemNameId = d['itemNameId'] ?? null;
    this.loadedItemName = d['itemName'] ?? '';
    this.selectedItemNameId.set(this.loadedItemNameId);
    const date = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');

    this.form.patchValue({
      name: d['itemName'] ?? d['name'] ?? '',
      price: d['price'] ?? null,
      currencyId: d['currencyId'] ?? null,
      exchangeRate: d['exchangeRate'] ?? null,
      departmentId: d['departmentId'] ?? null,
      quantity: 1,
      description: d['description'] ?? '',

      serialNumber: d['serialNumber'] ?? '',
      brandId: d['brandId'] ?? null,
      modelId: d['modelId'] ?? null,
      materialId: d['materialId'] ?? null,
      countryId: d['countryId'] ?? null,
      capacity: d['capacity'] ?? '',
      dimensions: d['dimensions'] ?? '',
      groupId: d['groupId'] ?? null,
      locationId: d['locationId'] ?? null,

      workingDate: date(d['workingDate']),
      depreciationRate: d['depreciationRate'] ?? null,
      depreciationYears: d['depreciationYears'] ?? null,
      depreciationDate: date(d['depreciationDate']),
    });

    const detailOptions: Record<string, { id: string | number; name: string }> = {
      itemNames: { id: d['itemNameId'], name: d['itemName'] ?? '' },
      brands: { id: d['brandId'], name: d['brandName'] ?? '' },
      models: { id: d['modelId'], name: d['modelName'] ?? '' },
      materials: { id: d['materialId'], name: d['materialName'] ?? '' },
      groups: { id: d['groupId'], name: d['groupName'] ?? '' },
      departments: {
        id: d['departmentId'],
        name: d['departmentTitle'] ?? d['departmentName'] ?? '',
      },
    };
    for (const [key, option] of Object.entries(detailOptions)) {
      if (option.id !== null && option.id !== undefined && option.name) {
        this.loadedDropdownDetails[key] = option;
        this.modalDropdownOptions.update((all) => ({
          ...all,
          [key]: this.withLoadedDropdownOption(key, all[key] ?? []),
        }));
      }
    }

    // The API returns a relative path (/uploads/...), so build the full URL
    const img = d['imagePath'] ?? d['imageUrl'] ?? d['image'];
    const fullUrl = toImageUrl(typeof img === 'string' ? img : null);
    if (fullUrl) this.imagePreview.set(fullUrl);
  }

  private loadModalDropdowns(): void {
    const businessId = this.business()?.id;
    if (!businessId) return;

    for (const key of this.dropdownKeys) {
      this.modalDropdownLoading.update((state) => ({ ...state, [key]: true }));
    }

    this.dropdownService
      .itemFormLookups({ businessId, pageSize: this.modalDropdownPageSize })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lookups) => {
          this.formItemNames = lookups.itemNames ?? [];
          const firstPages: Record<string, LazyDropdownOption[]> = {
            itemNames: (lookups.itemNames ?? []).map(({ id, name }) => ({ id, name })),
            brands: (lookups.brands ?? []).map(({ id, name }) => ({ id, name })),
            models: (lookups.itemModels ?? []).map(({ id, name }) => ({ id, name })),
            materials: (lookups.materials ?? []).map(({ id, name }) => ({ id, name })),
            // The consolidated endpoint returns numeric group keys, while ItemRequest.GroupId expects a UUID.
            // Load groups from the business-scoped dropdown endpoint, which returns the correct IDs.
            groups: [],
            departments: (lookups.departments ?? []).map(({ id, title }) => ({ id, name: title })),
          };

          for (const key of this.dropdownKeys) {
            const options = this.withLoadedDropdownOption(key, firstPages[key] ?? []);
            this.modalDropdownOptions.update((all) => ({ ...all, [key]: options }));
            this.modalDropdownPages.update((pages) => ({ ...pages, [key]: 1 }));
            this.modalDropdownHasMore.update((state) => ({
              ...state,
              [key]: (firstPages[key]?.length ?? 0) >= this.modalDropdownPageSize,
            }));
            this.modalDropdownLoading.update((state) => ({ ...state, [key]: false }));
          }

          this.loadLocationLevel(0, null);
          this.loadModalDropdown('groups', true);
        },
        error: () => {
          // Preserve the existing individual endpoints as a fallback if the consolidated lookup fails.
          for (const key of this.dropdownKeys) this.loadModalDropdown(key, true);
          this.loadLocationLevel(0, null);
        },
      });
  }

  locationOptions(level: number): LazyDropdownOption[] {
    return (this.locationLevels()[level] ?? []).map((location) => ({
      id: location.id,
      name: location.title ?? location.name,
    }));
  }

  loadLocationLevel(level: number, parentId: string | null): void {
    const businessId = this.business()?.id;
    if (!businessId || this.locationLevelLoading()[level] || this.locationLevels()[level]?.length)
      return;
    this.locationLevelLoading.update((state) => ({ ...state, [level]: true }));
    this.dropdownService
      .locations({ businessId, parentId, pageNumber: 1, pageSize: 1000, search: '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.locationLevels.update((levels) => {
            const next = levels.slice(0, level);
            if (response.data.data.length || level === 0) next[level] = response.data.data;
            return next;
          });
          this.locationLevelLoading.update((state) => ({ ...state, [level]: false }));
        },
        error: () => this.locationLevelLoading.update((state) => ({ ...state, [level]: false })),
      });
  }

  selectLocation(level: number, location: LazyDropdownOption): void {
    const id = String(location.id);
    this.selectedLocationIds.update((selected) => {
      const next = selected.slice(0, level);
      next[level] = id;
      return next;
    });
    this.form.controls.locationId.setValue(id);
    this.locationLevels.update((levels) => levels.slice(0, level + 1));
    this.loadLocationLevel(level + 1, id);
  }

  clearLocation(level: number): void {
    this.selectedLocationIds.update((selected) => selected.slice(0, level));
    this.locationLevels.update((levels) => (level === 0 ? [[]] : levels.slice(0, level)));
    this.form.controls.locationId.setValue(this.selectedLocationIds().at(-1) ?? null);
  }

  loadModalDropdown(key: string, reset = false): void {
    const businessId = this.business()?.id;
    if (!businessId) return;
    if (!reset && (this.modalDropdownLoading()[key] || !this.modalDropdownHasMore()[key])) return;

    if (reset) {
      this.dropdownRequests[key]?.unsubscribe();
      this.modalDropdownPages.update((pages) => ({ ...pages, [key]: 0 }));
      this.modalDropdownHasMore.update((state) => ({ ...state, [key]: false }));
      this.modalDropdownOptions.update((all) => ({ ...all, [key]: [] }));
    }

    const pageNumber = reset ? 1 : (this.modalDropdownPages()[key] ?? 0) + 1;
    const query = {
      businessId,
      pageNumber,
      pageSize: this.modalDropdownPageSize,
      search: this.modalDropdownSearch()[key]?.trim() ?? '',
    };
    const request =
      key === 'itemNames'
        ? this.dropdownService.itemNames(query)
        : key === 'brands'
          ? this.dropdownService.brands(query)
          : key === 'models'
            ? this.dropdownService.itemModels(query)
            : key === 'materials'
              ? this.dropdownService.materials(query)
              : key === 'groups'
                ? this.dropdownService.groups(query)
                : key === 'departments'
                  ? this.dropdownService.departments(query)
                  : this.dropdownService.locations(query);

    this.modalDropdownLoading.update((state) => ({ ...state, [key]: true }));
    this.dropdownRequests[key] = request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        const page = response.data;
        const loaded = page.data.map((item) => ({ id: item.id, name: item.title ?? item.name }));
        const options = reset ? loaded : [...(this.modalDropdownOptions()[key] ?? []), ...loaded];
        this.modalDropdownOptions.update((all) => ({
          ...all,
          [key]: this.withLoadedDropdownOption(key, options),
        }));
        if (key === 'itemNames') {
          const names = loaded.map((item) => ({ id: Number(item.id), name: item.name }));
          this.formItemNames = reset ? names : [...this.formItemNames, ...names];
        }
        this.modalDropdownPages.update((pages) => ({ ...pages, [key]: page.currentPage }));
        this.modalDropdownHasMore.update((state) => ({ ...state, [key]: page.hasNextPage }));
        this.modalDropdownLoading.update((state) => ({ ...state, [key]: false }));
      },
      error: () => this.modalDropdownLoading.update((state) => ({ ...state, [key]: false })),
    });
  }

  private withLoadedDropdownOption(
    key: string,
    options: LazyDropdownOption[],
  ): LazyDropdownOption[] {
    const selected = this.loadedDropdownDetails[key];
    // The item-name input already keeps its edit value; don't append it to the paged list,
    // otherwise the initial 10 options can become 11.
    if (
      key === 'itemNames' ||
      !selected ||
      options.some((option) => String(option.id) === String(selected.id))
    )
      return options;
    return [...options, selected];
  }

  searchModalDropdown(key: string, term: string): void {
    this.modalDropdownSearch.update((search) => ({ ...search, [key]: term }));
    if (this.newDropdownNames()[key] !== term.trim()) {
      this.newDropdownNames.update((names) => ({ ...names, [key]: '' }));
    }
    this.dropdownSearchSubjects[key]?.next(term.trim());
  }

  searchItemNames(term: string): void {
    this.form.controls.name.setValue(term);
    const exactMatch = this.modalOptions('itemNames').find(
      (option) => option.name.trim().toLowerCase() === term.trim().toLowerCase(),
    );
    if (exactMatch) {
      this.selectItemName(exactMatch);
    } else if (term.trim().toLowerCase() !== this.loadedItemName.toLowerCase()) {
      this.selectedItemNameId.set(null);
      this.loadedItemNameId = null;
      this.loadedItemName = '';
      this.newDropdownNames.update((names) => ({ ...names, itemNames: '' }));
    }
    this.searchModalDropdown('itemNames', term);
  }

  onItemNameSuggestionsScroll(event: Event): void {
    const list = event.target as HTMLElement;
    if (
      this.modalDropdownHasMore()['itemNames'] &&
      !this.modalDropdownLoading()['itemNames'] &&
      list.scrollTop + list.clientHeight >= list.scrollHeight - 24
    ) {
      this.loadModalDropdown('itemNames');
    }
  }

  selectItemName(option: LazyDropdownOption): void {
    const id = Number(option.id);
    this.form.controls.name.setValue(option.name);
    this.selectedItemNameId.set(id);
    this.loadedItemNameId = id;
    this.loadedItemName = option.name;
    this.newDropdownNames.update((names) => ({ ...names, itemNames: '' }));
    this.modalDropdownSearch.update((search) => ({ ...search, itemNames: '' }));
    this.itemNameSuggestionsOpen.set(false);
  }

  newOptionText(key: string): string {
    const value = this.modalDropdownSearch()[key]?.trim();
    if (
      !value ||
      this.modalDropdownLoading()[key] ||
      this.modalOptions(key).some(
        (option) => option.name.trim().toLowerCase() === value.toLowerCase(),
      )
    )
      return '';
    const labels: Record<string, string> = {
      itemNames: 'item name',
      brands: 'brand',
      models: 'model',
      materials: 'material',
    };
    const label = labels[key];
    return label ? `Add “${value}” as new ${label}` : '';
  }

  selectNewDropdownName(key: string, value: string): void {
    const name = value.trim();
    if (!name) return;
    this.newDropdownNames.update((names) => ({ ...names, [key]: name }));
    if (key === 'itemNames') {
      this.form.controls.name.setValue(name);
      this.selectedItemNameId.set(null);
      this.loadedItemNameId = null;
      this.loadedItemName = '';
    } else if (key === 'brands') this.form.controls.brandId.setValue(null);
    else if (key === 'models') this.form.controls.modelId.setValue(null);
    else if (key === 'materials') this.form.controls.materialId.setValue(null);
  }

  clearNewDropdownName(key: string): void {
    this.newDropdownNames.update((names) => ({ ...names, [key]: '' }));
  }

  clearModalDropdownSearch(key: string): void {
    if (!this.modalDropdownSearch()[key]) return;
    this.modalDropdownSearch.update((search) => ({ ...search, [key]: '' }));
    this.dropdownSearchSubjects[key]?.next('');
  }

  modalOptions(key: string): LazyDropdownOption[] {
    return this.modalDropdownOptions()[key] ?? [];
  }

  onDepreciationRateInput(rawValue: string): void {
    const rate = rawValue.trim() === '' ? null : Number(rawValue);
    this.form.controls.depreciationRate.setValue(
      rate !== null && Number.isFinite(rate) ? rate : null,
    );
    if (rate === null || !Number.isFinite(rate) || rate <= 0 || rate > 100) {
      this.form.controls.depreciationYears.setValue(null);
      this.form.controls.depreciationDate.setValue('');
      return;
    }
    this.form.controls.depreciationYears.setValue(Math.max(1, Math.round(100 / rate)));
    this.recalculateDepreciationDate();
  }

  onDepreciationYearsInput(rawValue: string): void {
    const parsedYears = rawValue.trim() === '' ? null : Number(rawValue);
    const years =
      parsedYears === null || !Number.isFinite(parsedYears)
        ? null
        : Math.max(1, Math.round(parsedYears));
    this.form.controls.depreciationYears.setValue(
      years !== null && Number.isFinite(years) ? years : null,
    );
    if (years === null || !Number.isFinite(years) || years <= 0) {
      this.form.controls.depreciationRate.setValue(null);
      this.form.controls.depreciationDate.setValue('');
      return;
    }
    this.form.controls.depreciationRate.setValue(this.roundToTwo(100 / years));
    this.recalculateDepreciationDate();
  }

  recalculateDepreciationDate(workingDate = this.form.controls.workingDate.value): void {
    const years = this.form.controls.depreciationYears.value;
    if (!workingDate || years === null || !Number.isFinite(years) || years <= 0) {
      this.form.controls.depreciationDate.setValue('');
      return;
    }

    const [year, month, day] = workingDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      this.form.controls.depreciationDate.setValue('');
      return;
    }
    date.setDate(date.getDate() + Math.round(years * 365.2425));
    const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.form.controls.depreciationDate.setValue(formatted);
  }

  private roundToTwo(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // ---------- helpers ----------
  showError(name: keyof ItemModalComponent['form']['controls']): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  // ---------- image ----------
  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.setImage(file);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) this.setImage(file);
  }

  private setImage(file: File): void {
    this.clearImage();
    this.imageFile.set(file);
    this.imagePreview.set(URL.createObjectURL(file));
  }

  clearImage(): void {
    const url = this.imagePreview();
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    this.imagePreview.set(null);
    this.imageFile.set(null);
  }

  // ---------- actions ----------
  close(): void {
    if (this.saving()) return;
    this.closed.emit();
  }

  submit(): void {
    this.form.controls.quantity.setValue(1, { emitEvent: false });
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.status.set('');

    if (!this.business()) {
      this.status.set('Select a business first.');
      return;
    }

    const rateMissing = this.needsConversion() && !this.form.controls.exchangeRate.value;
    if (this.form.invalid || rateMissing) {
      this.status.set(
        rateMissing
          ? 'Exchange rate is required for this currency.'
          : 'Please fix the highlighted fields.',
      );
      this.jumpToFirstError(rateMissing);
      return;
    }

    const id = this.itemId();
    const copies = id ? 1 : this.form.controls.copyCount.value;
    const request$: Observable<unknown> = id
      ? this.service.update(id, this.buildPayload())
      : this.service.create(this.buildPayload());

    this.saving.set(true);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        toast.success(
          id
            ? 'Item updated successfully'
            : copies > 1
              ? `${copies} items created successfully`
              : 'Item created successfully',
        );
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        console.error('Save item failed:', err?.error ?? err);
        this.status.set(this.extractError(err));
        toast.error('Could not save item');
      },
    });
  }

  /** Pulls the validation message out of the API error (ASP.NET ProblemDetails / custom shapes). */
  private extractError(err: unknown): string {
    const fallback = 'Could not save the item.';
    const body = (err as { error?: any } | null)?.error;
    if (!body) return fallback;
    if (typeof body === 'string') return body || fallback;

    const errors = body.errors;
    if (Array.isArray(errors) && errors.length) {
      return errors
        .map((e: any) => (typeof e === 'string' ? e : (e?.message ?? JSON.stringify(e))))
        .slice(0, 3)
        .join(' | ');
    }
    if (errors && typeof errors === 'object') {
      const msgs = Object.entries(errors).flatMap(([field, v]) =>
        (Array.isArray(v) ? v : [v]).map((m) => `${field}: ${m}`),
      );
      if (msgs.length) return msgs.slice(0, 3).join(' | ');
    }
    return body.message ?? body.title ?? body.detail ?? fallback;
  }

  private jumpToFirstError(rateMissing: boolean): void {
    if (rateMissing) {
      this.activeTab.set('general');
      return;
    }
    for (const tab of this.tabs) {
      const hasError = this.tabControls[tab.id].some((name) => this.form.get(name)?.invalid);
      if (hasError) {
        this.activeTab.set(tab.id);
        return;
      }
    }
  }

  /** Matches the item name to an existing one (id) or sends it as a new name. */
  private resolveItemName(name: string): { itemNameId: number | null; newItemName: string | null } {
    const newName = this.newDropdownNames()['itemNames'];
    if (newName) return { itemNameId: null, newItemName: newName };
    const key = name.toLowerCase();
    const match = [...this.itemNames(), ...this.formItemNames].find(
      (n) => n.name.trim().toLowerCase() === key,
    );
    if (match) return { itemNameId: Number(match.id), newItemName: null };

    if (this.loadedItemNameId !== null && this.loadedItemName.trim().toLowerCase() === key) {
      return { itemNameId: this.loadedItemNameId, newItemName: null };
    }
    return { itemNameId: null, newItemName: name };
  }

  private buildPayload(): ItemRequest {
    const v = this.form.getRawValue();
    const text = (value: string) => value.trim() || null;
    const { itemNameId, newItemName } = this.resolveItemName(v.name.trim());

    return {
      businessId: this.business()!.id,
      numberOfCopies: this.isEdit() ? null : v.copyCount,

      itemNameId,
      newItemName,
      serialNumber: text(v.serialNumber),

      groupId: v.groupId,
      locationId: v.locationId,
      departmentId: v.departmentId,

      price: v.price,
      currencyId: v.currencyId,
      exchangeRate: this.needsConversion() ? v.exchangeRate : null,

      brandId: this.newDropdownNames()['brands'] ? null : v.brandId,
      newBrandName: this.newDropdownNames()['brands'] || null,
      modelId: this.newDropdownNames()['models'] ? null : v.modelId,
      newModelName: this.newDropdownNames()['models'] || null,
      materialId: this.newDropdownNames()['materials'] ? null : v.materialId,
      newMaterialName: this.newDropdownNames()['materials'] || null,
      countryId: v.countryId,

      capacity: text(v.capacity),
      dimensions: text(v.dimensions),
      quantity: 1,
      description: text(v.description),
      image: this.imageFile(),

      workingDate: v.workingDate || null,
      depreciationRate: v.depreciationRate,
      depreciationYears:
        v.depreciationYears === null ? null : Math.max(1, Math.round(v.depreciationYears)),
      depreciationDate: v.depreciationDate || null,
      scraping: false,
    };
  }
}
