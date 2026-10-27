import { Component, computed, effect, HostListener, inject, input, output, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { MaintenanceCompany, MaintenanceCompanyRequest, MaintenanceCompanyDetail, ContactPerson } from '../../../core/models/maintenance-company-modal';

import { DropdownItem } from '../../../core/services/drop-down-services';
import { MaintenanceCompanyServices } from '../../../core/services/maintenance-company-services';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-maintenance-Company-modal',
  styleUrl: './maintenance-compnaey-modal.component.css',
  templateUrl: './maintenance-compnaey-modal.component.html',
})
export class MaintenanceCompyModalComponent {
 private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(MaintenanceCompanyServices);
 
  readonly company = input<MaintenanceCompany | null>(null);
  readonly specialties = input<DropdownItem<number>[]>([]);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
 
  readonly saved = output<MaintenanceCompanyRequest>();
  readonly cancelled = output<void>();
 
  readonly isEdit = computed(() => !!this.company());
 
  readonly detailsResource = rxResource({
    params: () => this.company()?.id,
    stream: ({ params }) => this.api.getById(params).pipe(map((res) => res.data)),
  });
 
  readonly ready = computed(() => !this.isEdit() || this.detailsResource.hasValue());
 
  readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
    address: this.fb.control(''),
    notes: this.fb.control(''),
    specialtyId: this.fb.control<number | null>(null, [Validators.required]),
    contactPeople: this.fb.array([contactGroup(this.fb)]),
  });
 
  get contacts() {
    return this.form.controls.contactPeople;
  }
 
  constructor() {
    // edit mode: fill the form once the details arrive
    effect(() => {
      const detail = this.detailsResource.hasValue() ? this.detailsResource.value() : null;
      if (detail) untracked(() => this.patch(detail));
    });
  }
 
  private patch(d: MaintenanceCompanyDetail): void {
    this.form.patchValue({
      name: d.name,
      address: d.address ?? '',
      notes: d.notes ?? '',
      specialtyId: d.specialtyId,
    });
    this.contacts.clear();
    d.contactPeople.forEach((c) => this.contacts.push(contactGroup(this.fb, c)));
    if (!d.contactPeople.length) this.addContact();
  }
 
  addContact(): void {
    this.contacts.push(contactGroup(this.fb));
  }
 
  removeContact(index: number): void {
    this.contacts.removeAt(index);
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
      address: v.address.trim(),
      notes: v.notes.trim(),
      specialtyId: v.specialtyId!,
      contactPeople: v.contactPeople.map((c) => ({
        id: c.id,
        name: c.name.trim(),
        position: c.position.trim(),
        phone: c.phone.trim(),
        email: c.email.trim(),
      })),
    });
  }
 
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.saving()) this.cancelled.emit();
  }
}
 
function contactGroup(fb: NonNullableFormBuilder, c?: ContactPerson) {
  return fb.group({
    id: fb.control(c?.id ?? 0), // 0 = new contact
    name: fb.control(c?.name ?? '', [Validators.required, Validators.maxLength(100)]),
    position: fb.control(c?.position ?? ''),
    phone: fb.control(c?.phone ?? ''),
    email: fb.control(c?.email ?? '', [Validators.email]),
  });
}
