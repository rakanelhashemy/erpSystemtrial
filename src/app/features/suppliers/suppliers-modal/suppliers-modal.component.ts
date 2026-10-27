import { Component, computed, effect, HostListener, inject, input, output, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormBuilder, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { Supplier, SupplierRequest, SupplierDetail, ContactPerson } from '../../../core/models/supplires-Modal';
import { DropdownItem } from '../../../core/services/drop-down-services';
import { Suppliers } from '../../../core/services/suppliers-service';

   

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-suppliers-modal',
  styleUrl: './suppliers-modal.component.css',
  templateUrl: './suppliers-modal.component.html',
})
export class SuppliersModalComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Suppliers);

  readonly supplier = input<Supplier | null>(null);
  readonly categories = input<DropdownItem<number>[]>([]);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly saved = output<SupplierRequest>();
  readonly cancelled = output<void>();

  readonly isEdit = computed(() => !!this.supplier());

  readonly detailsResource = rxResource({
    params: () => this.supplier()?.id,
    stream: ({ params }) => this.api.getById(params).pipe(map((res) => res.data)),
  });

  readonly ready = computed(() => !this.isEdit() || this.detailsResource.hasValue());

  readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
    address: this.fb.control(''),
    notes: this.fb.control(''),
    categoryId: this.fb.control<number | null>(null, [Validators.required]),
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

  private patch(d: SupplierDetail): void {
    this.form.patchValue({
      name: d.name,
      address: d.address,
      notes: d.notes,
      categoryId: d.categoryId,
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
      categoryId: v.categoryId!,
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

function contactGroup(fb: NonNullableFormBuilder, c?: Partial<ContactPerson>) {
  return fb.group({
    id: fb.control(c?.id ?? 0), // 0 = new contact
    name: fb.control(c?.name ?? '', [Validators.required, Validators.maxLength(100)]),
    position: fb.control(c?.position ?? ''),
    phone: fb.control(c?.phone ?? ''),
    email: fb.control(c?.email ?? '', [Validators.email]),
  });
}
