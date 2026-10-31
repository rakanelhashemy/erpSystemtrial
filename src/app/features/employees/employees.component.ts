import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, Subject, Subscription } from 'rxjs';
import { toast } from 'ngx-sonner';
import { Employee, EmployeeDetail, EmployeeRequest } from '../../core/models/employee';
import { DropDownServices, DropdownItem } from '../../core/services/drop-down-services';
import { EmployeesServices } from '../../core/services/employees-services';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { EmployessModalComponent } from './employess-modal/employess-modal.component';

interface AppliedFilters {
  departmentId: string | null;
  gender: number | null;
  active: boolean | null;
  jobTitle: string;
  phone: string;
  email: string;
}

const EMPTY_FILTERS: AppliedFilters = {
  departmentId: null,
  gender: null,
  active: null,
  jobTitle: '',
  phone: '',
  email: '',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HasPermissionDirective, EmployessModalComponent],
  selector: 'app-employees',
  styleUrl: './employees.component.css',
  templateUrl: './employees.component.html',
})
export class EmployeesComponent implements OnInit {
  private api = inject(EmployeesServices);
  private dropdown = inject(DropDownServices);

  readonly pageSize = 10;
  readonly deptPageSize = 10;

  private search$ = new Subject<string>();
  private deptSearch$ = new Subject<string>();
  private lastSearch = '';
  private lastDeptSearch = '';
  private loadSub?: Subscription;
  private deptSub?: Subscription;
  private deptCache: { items: DropdownItem<string>[]; hasNext: boolean; page: number } | null = null;

  private deptSentinel = viewChild<ElementRef<HTMLElement>>('deptSentinel');

  // Table
  items = signal<Employee[]>([]);
  totalCount = signal(0);
  pageNumber = signal(1);
  loading = signal(false);
  error = signal<string | null>(null);
  search = signal('');

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));
  from = computed(() => (this.totalCount() === 0 ? 0 : (this.pageNumber() - 1) * this.pageSize + 1));
  to = computed(() => Math.min(this.pageNumber() * this.pageSize, this.totalCount()));
  hasPreviousPage = computed(() => this.pageNumber() > 1);
  hasNextPage = computed(() => this.pageNumber() < this.totalPages());

  // Lookups (used by the modal + details)
  genders = signal<DropdownItem<number>[]>([]);

  genderLabel(id: number | null | undefined): string {
    return this.genders().find((g) => g.id === id)?.name ?? '—';
  }

  // Department filter dropdown (infinite scroll + server-side search)
  deptItems = signal<DropdownItem<string>[]>([]);
  selectedDepartment = signal<DropdownItem<string> | null>(null);
  deptSearch = signal('');
  deptPage = signal(0);
  deptHasNext = signal(false);
  deptLoading = signal(false);
  deptOpen = signal(false);

  // Filters
  filtersOpen = signal(false);
  draftGender = signal<number | null>(null);
  draftActive = signal<boolean | null>(null);
  draftJobTitle = signal('');
  draftPhone = signal('');
  draftEmail = signal('');
  applied = signal<AppliedFilters>({ ...EMPTY_FILTERS });

  activeFiltersCount = computed(() => {
    const f = this.applied();
    return (
      (f.departmentId ? 1 : 0) +
      (f.gender !== null ? 1 : 0) +
      (f.active !== null ? 1 : 0) +
      (f.jobTitle ? 1 : 0) +
      (f.phone ? 1 : 0) +
      (f.email ? 1 : 0)
    );
  });

  // Add / Edit modal
  modalOpen = signal(false);
  modalEmployee = signal<Employee | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);

  // Delete modal
  deleteTarget = signal<Employee | null>(null);
  deleting = signal(false);
  deleteError = signal<string | null>(null);

  // Details modal
  detailsEmployee = signal<Employee | null>(null);
  detailsExtra = signal<EmployeeDetail | null>(null);
  detailsLoading = signal(false);

  constructor() {
    effect((onCleanup) => {
      const el = this.deptSentinel()?.nativeElement;
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && this.deptHasNext() && !this.deptLoading()) {
            this.loadDepartments();
          }
        },
        { rootMargin: '40px' },
      );
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });

    this.search$.pipe(debounceTime(400), takeUntilDestroyed()).subscribe(() => {
      const term = this.search().trim();
      if (term === this.lastSearch) return;
      this.lastSearch = term;
      this.pageNumber.set(1);
      this.load();
    });

    this.deptSearch$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      if (this.deptSearch().trim() === this.lastDeptSearch) return;
      this.loadDepartments(true);
    });
  }

  ngOnInit(): void {
    this.load();
    this.loadDepartments(true);

    this.dropdown.staticLookups().subscribe((res) => this.genders.set(res.genders));
  }

  // ---------- Employees ----------

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.loadSub?.unsubscribe();
    this.loadSub = this.api
      .list({
        pageNumber: this.pageNumber(),
        pageSize: this.pageSize,
        search: this.search().trim(),
        ...this.applied(),
      })
      .subscribe({
        next: (page) => {
          this.items.set(page.data);
          this.totalCount.set(page.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load employees.');
        },
      });
  }

  onSearch(term: string): void {
    this.search.set(term);
    this.search$.next(term);
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

  // ---------- Department dropdown ----------

  loadDepartments(reset = false): void {
    const page = reset ? 1 : this.deptPage() + 1;
    const term = this.deptSearch().trim();
    if (reset) this.lastDeptSearch = term;

    this.deptSub?.unsubscribe();
    this.deptLoading.set(true);

    this.deptSub = this.dropdown
      .departments({ pageNumber: page, pageSize: this.deptPageSize, search: term })
      .subscribe({
        next: (res) => {
          const p = res.data;
          this.deptItems.update((cur) => (reset ? p.data : [...cur, ...p.data]));
          this.deptPage.set(p.currentPage);
          this.deptHasNext.set(p.hasNextPage);
          this.deptLoading.set(false);

          if (reset && !term) {
            this.deptCache = { items: p.data, hasNext: p.hasNextPage, page: p.currentPage };
          }
        },
        error: () => this.deptLoading.set(false),
      });
  }

  onDeptSearch(term: string): void {
    this.deptSearch.set(term);
    this.deptSearch$.next(term);
  }

  openDeptDropdown(): void {
    this.deptOpen.set(true);
  }

  closeDeptDropdown(): void {
    this.deptOpen.set(false);
    if (!this.deptSearch()) return;

    this.deptSearch.set('');
    const cache = this.deptCache;
    if (cache) {
      this.deptSub?.unsubscribe();
      this.deptLoading.set(false);
      this.lastDeptSearch = '';
      this.deptItems.set(cache.items);
      this.deptPage.set(cache.page);
      this.deptHasNext.set(cache.hasNext);
    } else {
      this.loadDepartments(true);
    }
  }

  selectDepartment(d: DropdownItem<string> | null): void {
    this.selectedDepartment.set(d);
    this.closeDeptDropdown();
  }

  // ---------- Filters ----------

  applyFilters(): void {
    this.applied.set({
      departmentId: this.selectedDepartment()?.id ?? null,
      gender: this.draftGender(),
      active: this.draftActive(),
      jobTitle: this.draftJobTitle().trim(),
      phone: this.draftPhone().trim(),
      email: this.draftEmail().trim(),
    });
    this.pageNumber.set(1);
    this.load();
  }

  resetFilters(): void {
    this.selectedDepartment.set(null);
    this.draftGender.set(null);
    this.draftActive.set(null);
    this.draftJobTitle.set('');
    this.draftPhone.set('');
    this.draftEmail.set('');
    this.applyFilters();
  }

  // ---------- Add / Edit ----------

  openAdd(): void {
    this.modalEmployee.set(null);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(employee: Employee): void {
    this.modalEmployee.set(employee);
    this.saveError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.modalEmployee.set(null);
    this.saveError.set(null);
  }

  onSaved(body: EmployeeRequest): void {
    if (this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);

    const edited = this.modalEmployee();
    const request$ = edited ? this.api.update(edited.id, body) : this.api.create(body);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        toast.success(edited ? 'Employee updated successfully' : 'Employee created successfully');
        this.closeModal();
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'Could not save the employee. Please try again.');
      },
    });
  }

  // ---------- Delete ----------

  openDelete(employee: Employee): void {
    this.deleteTarget.set(employee);
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
        toast.success('Employee deleted successfully');
        // if it was the last item on the page, go back one page
        if (this.items().length === 1 && this.pageNumber() > 1) {
          this.pageNumber.update((p) => p - 1);
        }
        this.load();
      },
      error: (err) => {
        this.deleting.set(false);
        this.deleteError.set(
          err?.error?.message ?? 'Could not delete this employee. It may be linked to other records.',
        );
      },
    });
  }

  // ---------- Details ----------

  openDetails(employee: Employee): void {
    this.detailsEmployee.set(employee);
    this.detailsExtra.set(null);
    this.detailsLoading.set(true);

    this.api.getById(employee.id).subscribe({
      next: (res) => {
        this.detailsExtra.set(res.data);
        this.detailsLoading.set(false);
      },
      error: () => this.detailsLoading.set(false),
    });
  }

  closeDetails(): void {
    this.detailsEmployee.set(null);
    this.detailsExtra.set(null);
  }

  // ---------- Escape ----------

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.deleteTarget()) this.cancelDelete();
    else if (this.detailsEmployee()) this.closeDetails();
  }
}
