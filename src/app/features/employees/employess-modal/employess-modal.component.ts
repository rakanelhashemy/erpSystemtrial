import { Component, computed, effect, HostListener, inject, input, output, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { Employee, EmployeeRequest, EmployeeDetail } from '../../../core/models/employee';
import { DropdownItem } from '../../../core/services/drop-down-services';
import { EmployeesServices } from '../../../core/services/employees-services';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-employess-modal',
  styleUrl: './employess-modal.component.css',
  templateUrl: './employess-modal.component.html',
})
export class EmployessModalComponent { 

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(EmployeesServices);
 
  readonly employee = input<Employee | null>(null);
  readonly departments = input<DropdownItem<string>[]>([]);
  readonly genders = input<DropdownItem<number>[]>([]);
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
    // edit mode: fill the form once the details arrive
    effect(() => {
      const detail = this.detailsResource.hasValue() ? this.detailsResource.value() : null;
      if (detail) untracked(() => this.patch(detail));
    });
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
