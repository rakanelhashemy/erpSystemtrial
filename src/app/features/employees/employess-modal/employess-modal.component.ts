import { Component, computed, DestroyRef, effect, HostListener, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, map, Subject, Subscription } from 'rxjs';
import { Employee, EmployeeRequest, EmployeeDetail } from '../../../core/models/employee';
import { DropDownServices, DropdownItem } from '../../../core/services/drop-down-services';
import { EmployeesServices } from '../../../core/services/employees-services';
import { LazyDropdownComponent, LazyDropdownOption } from '../../../shared/ui/lazy-dropdown/lazy-dropdown.component';

@Component({
  imports: [ReactiveFormsModule, LazyDropdownComponent],
  selector: 'app-employess-modal',
  styleUrl: './employess-modal.component.css',
  templateUrl: './employess-modal.component.html',
})
export class EmployessModalComponent { 

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(EmployeesServices);
  private readonly dropdown = inject(DropDownServices);
  private readonly destroyRef = inject(DestroyRef);
 
  readonly employee = input<Employee | null>(null);
  readonly genders = input<DropdownItem<number>[]>([]);
  readonly departments = signal<LazyDropdownOption[]>([]);
  readonly departmentSearch = signal('');
  readonly departmentPage = signal(0);
  readonly departmentHasMore = signal(false);
  readonly departmentLoading = signal(false);
  private departmentRequest?: Subscription;
  private readonly departmentSearch$ = new Subject<string>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);
 
  readonly saved = output<EmployeeRequest>();
  readonly cancelled = output<void>();
 
  readonly isEdit = computed(() => !!this.employee());
 
  readonly detailsResource = rxResource({
    params: () => this.employee()?.id,
    stream: ({ params }) => this.api.getById(params).pipe(map((res) => res.data)),
  });
 
  readonly ready = computed(() => !this.isEdit() || this.detailsResource.hasValue());
 
  readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
    jobTitle: this.fb.control('', [Validators.maxLength(100)]),
    departmentId: this.fb.control<string | null>(null, [Validators.required]),
    gender: this.fb.control<number | null>(null, [Validators.required]),
    phone: this.fb.control('', [Validators.maxLength(30)]),
    email: this.fb.control('', [Validators.email]),
    active: this.fb.control(true),
  });
 
  constructor() {
    this.departmentSearch$.pipe(debounceTime(250), takeUntilDestroyed()).subscribe(() => this.loadDepartments(true));
    this.loadDepartments(true);
    // edit mode: fill the form once the details arrive
    effect(() => {
      const detail = this.detailsResource.hasValue() ? this.detailsResource.value() : null;
      if (detail) untracked(() => this.patch(detail));
    });
  }

  loadDepartments(reset = false): void {
    if (!reset && (this.departmentLoading() || !this.departmentHasMore())) return;
    if (reset) {
      this.departmentRequest?.unsubscribe();
      this.departmentPage.set(0);
      this.departments.set([]);
    }
    this.departmentLoading.set(true);
    const pageNumber = reset ? 1 : this.departmentPage() + 1;
    this.departmentRequest = this.dropdown.departments({ pageNumber, pageSize: 10, search: this.departmentSearch().trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ data }) => {
          const options = data.data.map((department) => ({ id: department.id, name: department.title ?? department.name }));
          const selectedId = this.form.controls.departmentId.value;
          const detail = this.detailsResource.hasValue() ? this.detailsResource.value() : null;
          const selected = detail?.departmentId && selectedId === detail.departmentId
            ? { id: detail.departmentId, name: detail.departmentName ?? '' }
            : null;
          this.departments.set(reset ? options : [...this.departments(), ...options]);
          if (selected?.name && !this.departments().some((item) => item.id === selected.id)) {
            const loadedCount = Math.max(10, data.currentPage * 10);
            this.departments.update((items) => [...items.slice(0, loadedCount - 1), selected]);
          }
          this.departmentPage.set(data.currentPage);
          this.departmentHasMore.set(data.hasNextPage);
          this.departmentLoading.set(false);
        },
        error: () => this.departmentLoading.set(false),
      });
  }

  searchDepartments(term: string): void {
    this.departmentSearch.set(term);
    this.departmentSearch$.next(term);
  }

  selectDepartment(option: LazyDropdownOption): void {
    this.form.controls.departmentId.setValue(String(option.id));
  }
 
  private patch(d: EmployeeDetail): void {
    this.form.patchValue({
      name: d.name,
      jobTitle: d.jobTitle ?? '',
      departmentId: d.departmentId,
      gender: d.gender ?? null,
      phone: d.phone ?? '',
      email: d.email ?? '',
      active: d.active,
    });
    if (d.departmentId && d.departmentName && !this.departments().some((department) => department.id === d.departmentId)) {
      this.departments.update((departments) => [...departments, { id: d.departmentId, name: d.departmentName! }]);
    }
  }
 
  submit(): void {
    if (this.saving() || !this.ready()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
 
    const v = this.form.getRawValue();
    this.saved.emit({
      name: v.name.trim(),
      jobTitle: v.jobTitle.trim(),
      departmentId: v.departmentId!,
      gender: v.gender!,
      phone: v.phone.trim(),
      email: v.email.trim(),
      active: v.active,
    });
  }
 
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.saving()) this.cancelled.emit();
  }
}
