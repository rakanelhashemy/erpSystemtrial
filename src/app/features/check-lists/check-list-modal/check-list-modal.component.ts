import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  isDevMode,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from 'ngx-sonner';
import { CheckListAssignee, CheckListRequest } from '../../../core/models/checklist-modal';
import { DropDownServices, DropdownItem } from '../../../core/services/drop-down-services';
import { ChecklistServices } from '../../../core/services/checklist-services';
import { FormsModule } from '@angular/forms';
import {
  LazyDropdownComponent,
  LazyDropdownOption,
} from '../../../shared/ui/lazy-dropdown/lazy-dropdown.component';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  imports: [FormsModule, LazyDropdownComponent],
  selector: 'app-check-list-modal',
  styleUrl: './check-list-modal.component.css',
  templateUrl: './check-list-modal.component.html',
})
export class CheckListModalComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(ChecklistServices);
  private readonly dd = inject(DropDownServices);

  checkListId = input<string | null>(null);
  closed = output<void>();
  saved = output<void>();

  // ---------- form ----------
  title = '';
  auditDate = this.todayLocal();
  auditDateTouched = signal(false);
  auditDateError = signal<string | null>(null);
  businessId: string | null = null;
  groupId: string | null = null; // null = All
  locationId: string | null = null; // last selected level (or the original one in edit mode)
  assigneeToAdd: string | null = null;
  private rowVersion = '';
  private readonly pageSize = 10;
  private readonly searchSubjects = {
    businesses: new Subject<string>(),
    groups: new Subject<string>(),
    users: new Subject<string>(),
  };
  private readonly requests: Partial<Record<string, Subscription>> = {};
  private readonly searchTerms = signal({ businesses: '', groups: '', users: '' });

  assignees = signal<CheckListAssignee[]>([]);

  // ---------- state ----------
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  hasResults = signal(false);
  currentLocationName = signal<string | null>(null); // edit mode: location saved on the server

  businesses = signal<DropdownItem[]>([]);
  groups = signal<DropdownItem[]>([]);
  users = signal<DropdownItem[]>([]);
  locationLevels = signal<DropdownItem[][]>([[]]);
  locationSelectedIds = signal<string[]>([]);
  locationLoading = signal<Record<number, boolean>>({});
  locationPages = signal<Record<number, number>>({});
  locationHasMore = signal<Record<number, boolean>>({});
  businessPage = signal(0);
  businessHasMore = signal(false);
  businessLoading = signal(false);
  groupPage = signal(0);
  groupHasMore = signal(false);
  groupLoading = signal(false);
  userPage = signal(0);
  userHasMore = signal(false);
  userLoading = signal(false);
  selectedBusiness = signal<DropdownItem | null>(null);
  readonly businessOptions = computed(() => this.options(this.businesses()));
  readonly groupOptions = computed(() => this.options(this.groups()));
  readonly userOptions = computed(() => this.options(this.availableUsers()));
  readonly locationOptions = computed(() =>
    this.locationLevels().map((locations) => this.options(locations)),
  );

  availableUsers = computed(() => {
    const taken = new Set(this.assignees().map((a) => a.id));
    return this.users().filter((user) => !taken.has(String(user.id)));
  });

  get isEdit(): boolean {
    return !!this.checkListId();
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  private todayLocal(): string {
    const today = new Date();
    const localOffset = today.getTimezoneOffset() * 60_000;
    return new Date(today.getTime() - localOffset).toISOString().slice(0, 10);
  }

  onAuditDateChange(value: string): void {
    this.auditDate = value;
    if (this.auditDateTouched()) this.auditDateError.set(this.validateAuditDate(value));
  }

  touchAuditDate(): void {
    this.auditDateTouched.set(true);
    this.auditDateError.set(this.validateAuditDate(this.auditDate));
  }

  private validateAuditDate(value: string): string | null {
    return value ? null : 'Audit date is required.';
  }

  ngOnInit(): void {
    for (const key of ['businesses', 'groups', 'users'] as const) {
      this.searchSubjects[key]
        .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
        .subscribe((search) => {
          if (search !== this.searchTerms()[key]) return;
          if (key === 'businesses') this.loadBusinesses(true, search);
          else if (key === 'groups' || this.businessId)
            this.loadBusinessOptions(key, true, search);
        });
    }
    this.loadBusinesses(true);

    const id = this.checkListId();
    if (id) this.loadForEdit(id);
  }

  private loadForEdit(id: string): void {
    this.loading.set(true);
    this.service
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (res?.succeeded === false || !res?.data) {
            this.loading.set(false);
            this.error.set(res?.message ?? 'Could not load the check list.');
            return;
          }
          const d = res.data;
          this.rowVersion = d.rowVersion;
          this.hasResults.set(d.hasResults);
          this.title = d.title;
          this.auditDate = d.auditDate?.slice(0, 10) ?? '';
          this.auditDateTouched.set(false);
          this.auditDateError.set(null);
          this.businessId = d.businessId;
          this.selectedBusiness.set({ id: d.businessId, name: d.businessName });
          this.businesses.update((items) => [
            { id: d.businessId, name: d.businessName },
            ...items.filter((item) => String(item.id) !== d.businessId),
          ]);
          this.groupId = d.groupId ?? null;
          if (d.groupId && d.groupName) {
            this.groups.update((items) => [
              { id: d.groupId!, name: d.groupName! },
              ...items.filter((item) => String(item.id) !== d.groupId),
            ]);
          }
          this.locationId = d.locationId;
          this.currentLocationName.set(d.locationName);
          this.assignees.set(Array.isArray(d.assignees) ? d.assignees : []);
          this.loadBusinessOptions('groups', true);
          this.loadBusinessScope();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load the check list.');
        },
      });
  }

  // ---------- business scope ----------
  private loadBusinessScope(): void {
    this.loadBusinessOptions('users', true);
    this.loadLocationLevel(0, null);
  }

  private loadBusinesses(reset = false, search = this.searchTerms().businesses): void {
    if ((!reset && this.businessLoading()) || (!reset && !this.businessHasMore())) return;
    const pageNumber = reset ? 1 : this.businessPage() + 1;
    this.businessLoading.set(true);
    this.requests['businesses']?.unsubscribe();
    this.requests['businesses'] = this.dd
      .businesses({ pageNumber, pageSize: this.pageSize, search })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const page = response?.data;
          if (!Array.isArray(page?.data)) {
            this.businessLoading.set(false);
            this.error.set('Businesses response was invalid.');
            return;
          }
          const selected = this.selectedBusiness();
          const businessOptions = this.mergeOptions(
            this.businesses(),
            selected ? [selected, ...page.data] : page.data,
            reset,
          );
          this.businesses.set(
            selected && !businessOptions.some((item) => String(item.id) === String(selected.id))
              ? [selected, ...businessOptions]
              : businessOptions,
          );
          this.businessPage.set(page.currentPage ?? pageNumber);
          this.businessHasMore.set(!!page.hasNextPage);
          this.businessLoading.set(false);
        },
        error: () => {
          this.businessLoading.set(false);
          this.error.set('Could not load businesses.');
        },
      });
  }

  private loadBusinessOptions(
    key: 'groups' | 'users',
    reset = false,
    search = this.searchTerms()[key],
  ): void {
    const loading = key === 'groups' ? this.groupLoading() : this.userLoading();
    const hasMore = key === 'groups' ? this.groupHasMore() : this.userHasMore();
    const currentPage = key === 'groups' ? this.groupPage() : this.userPage();
    if (
      (key === 'users' && !this.businessId) ||
      (!reset && loading) ||
      (!reset && currentPage > 0 && !hasMore)
    )
      return;
    const pageNumber = reset ? 1 : currentPage + 1;
    if (key === 'groups') this.groupLoading.set(true);
    else this.userLoading.set(true);
    this.requests[key]?.unsubscribe();
    const query = {
      ...(key === 'users' && this.businessId ? { businessId: this.businessId } : {}),
      pageNumber,
      pageSize: this.pageSize,
      search,
    };
    const request = key === 'groups' ? this.dd.groups(query) : this.dd.users(query);
    this.requests[key] = request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        if (key === 'users' && isDevMode()) {
          console.log('[Checklist user dropdown response]', response);
        }
        const page = response?.data;
        if (!Array.isArray(page?.data)) {
          if (key === 'groups') this.groupLoading.set(false);
          else this.userLoading.set(false);
          this.error.set(`Could not load ${key}.`);
          return;
        }
        if (key === 'groups') {
          const selected = this.groups().find((group) => String(group.id) === this.groupId);
          this.groups.set(
            this.mergeOptions(
              this.groups(),
              selected ? [selected, ...page.data] : page.data,
              reset,
            ),
          );
          this.groupPage.set(page.currentPage ?? pageNumber);
          this.groupHasMore.set(!!page.hasNextPage);
          this.groupLoading.set(false);
        } else {
          this.users.update((items) => this.mergeOptions(items, page.data, reset));
          this.userPage.set(page.currentPage ?? pageNumber);
          this.userHasMore.set(!!page.hasNextPage);
          this.userLoading.set(false);
        }
      },
      error: () => {
        if (key === 'groups') this.groupLoading.set(false);
        else this.userLoading.set(false);
        this.error.set(`Could not load ${key}.`);
      },
    });
  }

  private mergeOptions(
    current: DropdownItem[],
    incoming: DropdownItem[],
    reset: boolean,
  ): DropdownItem[] {
    const combined = reset ? incoming : [...current, ...incoming];
    return [...new Map(combined.map((item) => [String(item.id), item])).values()];
  }

  options(items: DropdownItem[]): LazyDropdownOption[] {
    return items.map((item) => ({ id: item.id, name: this.optionName(item) }));
  }

  private optionName(item: DropdownItem): string {
    const user = item as DropdownItem & {
      fullName?: string;
      userName?: string;
      displayName?: string;
      email?: string;
    };
    const label = [
      user.title,
      user.fullName,
      user.userName,
      user.displayName,
      user.name,
      user.email,
    ]
      .find((value) => typeof value === 'string' && value.trim().length > 0)
      ?.trim();
    return label || String(item.id);
  }

  onOptionSearch(key: 'businesses' | 'groups' | 'users', term: string): void {
    const value = term.trim();
    this.searchTerms.update((current) => ({ ...current, [key]: value }));
    this.searchSubjects[key].next(value);
  }

  onBusinessSelected(option: LazyDropdownOption): void {
    this.selectedBusiness.set({ id: String(option.id), name: option.name });
    this.onBusinessChange(String(option.id));
  }

  onBusinessChange(businessId: string | null): void {
    for (const key of Object.keys(this.requests)) {
      if (key === 'groups') continue;
      this.requests[key]?.unsubscribe();
      delete this.requests[key];
    }
    this.businessId = businessId;
    this.selectedBusiness.set(
      businessId
        ? (this.businesses().find((business) => String(business.id) === businessId) ?? null)
        : null,
    );
    this.locationId = null;
    this.currentLocationName.set(null);
    this.assigneeToAdd = null;
    this.assignees.set([]);
    this.users.set([]);
    this.userPage.set(0);
    this.userHasMore.set(false);
    this.groupLoading.set(false);
    this.userLoading.set(false);
    this.locationPages.set({});
    this.locationHasMore.set({});
    this.locationLoading.set({});
    this.searchTerms.update((terms) => ({ ...terms, users: '' }));
    this.locationLevels.set([[]]);
    this.locationSelectedIds.set([]);
    if (businessId) this.loadBusinessScope();
  }

  // ---------- cascading location ----------
  locationLevelLoading(level: number): boolean {
    return this.locationLoading()[level] ?? false;
  }

  loadLocationLevel(level: number, parentId: string | null): void {
    if (!this.businessId || this.locationLevelLoading(level)) return;
    const pageNumber = (this.locationPages()[level] ?? 0) + 1;
    this.locationLoading.update((s) => ({ ...s, [level]: true }));
    this.requests[`location-${level}`]?.unsubscribe();
    this.requests[`location-${level}`] = this.dd
      .locations({
        businessId: this.businessId,
        parentId,
        pageNumber,
        pageSize: this.pageSize,
        search: '',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const page = res?.data;
          if (!Array.isArray(page?.data)) {
            this.locationLoading.update((state) => ({ ...state, [level]: false }));
            this.error.set('Locations response was invalid.');
            return;
          }
          const options = page.data;
          this.locationLevels.update((levels) => {
            const next = levels.slice();
            const existing = next[level] ?? [];
            next[level] = this.mergeOptions(existing, options, pageNumber === 1);
            return next;
          });
          this.locationPages.update((pages) => ({
            ...pages,
            [level]: page.currentPage ?? pageNumber,
          }));
          this.locationHasMore.update((pages) => ({ ...pages, [level]: !!page.hasNextPage }));
          this.locationLoading.update((s) => ({ ...s, [level]: false }));
        },
        error: () => {
          this.locationLoading.update((s) => ({ ...s, [level]: false }));
          this.error.set('Could not load locations.');
        },
      });
  }

  onLocationChange(level: number, id: string | null): void {
    for (const key of Object.keys(this.requests)) {
      if (key.startsWith('location-') && Number(key.slice(9)) >= level) {
        this.requests[key]?.unsubscribe();
        delete this.requests[key];
      }
    }
    this.locationLoading.update((state) =>
      Object.fromEntries(Object.entries(state).filter(([key]) => +key <= level)),
    );
    this.locationSelectedIds.update((sel) => sel.slice(0, level));
    this.locationLevels.update((levels) => levels.slice(0, level + 1));
    this.locationPages.update((pages) =>
      Object.fromEntries(Object.entries(pages).filter(([key]) => +key <= level)),
    );
    this.locationHasMore.update((pages) =>
      Object.fromEntries(Object.entries(pages).filter(([key]) => +key <= level)),
    );

    if (!id) {
      // cleared: fall back to the parent level (or nothing)
      this.locationId = this.locationSelectedIds().at(-1) ?? null;
      return;
    }
    this.locationSelectedIds.update((sel) => {
      const next = [...sel];
      next[level] = id;
      return next;
    });
    this.locationId = id;
    this.currentLocationName.set(null); // the user picked a new location
    this.loadLocationLevel(level + 1, id);
  }

  // ---------- assignees ----------
  addAssignee(): void {
    const id = this.assigneeToAdd;
    if (!id || this.assignees().some((assignee) => assignee.id === id)) return;
    const user = this.users().find((item) => String(item.id) === id);
    if (!user) return;
    this.assignees.update((list) => [...list, { id, fullName: this.optionName(user) }]);
    this.assigneeToAdd = null;
  }

  removeAssignee(id: string): void {
    this.assignees.update((list) => list.filter((a) => a.id !== id));
  }

  // ---------- save ----------
  save(): void {
    if (this.saving()) return;
    if (!this.title.trim()) return this.error.set('Title is required.');
    this.auditDateTouched.set(true);
    const dateError = this.validateAuditDate(this.auditDate);
    this.auditDateError.set(dateError);
    if (dateError) return this.error.set(dateError);
    if (!this.businessId) return this.error.set('Select a business.');
    if (!this.locationId) return this.error.set('Select a target location.');
    if (this.assignees().length === 0) return this.error.set('Add at least one assignee.');

    const body: CheckListRequest = {
      title: this.title.trim(),
      auditDate: this.auditDate,
      businessId: this.businessId,
      locationId: this.locationId,
      groupId: this.groupId || null,
      assigneeIds: this.assignees().map((a) => a.id),
      ...(this.isEdit ? { rowVersion: this.rowVersion } : {}),
    };

    this.saving.set(true);
    this.error.set(null);

    const id = this.checkListId();
    const request = id ? this.service.update(id, body) : this.service.create(body);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.saving.set(false);
        if (response?.succeeded === false) {
          this.error.set(this.firstApiError(response) ?? 'Could not save the check list.');
          return;
        }
        toast.success(id ? 'Check list updated' : 'Check list created');
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(
          err?.status === 409
            ? 'This check list was modified by someone else. Please close and reload.'
            : (err?.error?.message ?? this.firstApiError(err) ?? 'Could not save the check list.'),
        );
      },
    });
  }

  private firstApiError(error: any): string | null {
    const errors = error?.error?.errors;
    if (Array.isArray(errors)) return errors.find((value) => typeof value === 'string') ?? null;
    if (errors && typeof errors === 'object') {
      return (
        (Object.values(errors)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .find((value) => typeof value === 'string') as string | undefined) ?? null
      );
    }
    return typeof errors === 'string' ? errors : null;
  }
}
