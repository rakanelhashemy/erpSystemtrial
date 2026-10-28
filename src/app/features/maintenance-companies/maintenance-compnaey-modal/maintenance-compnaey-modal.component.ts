import { Component, computed, DestroyRef, effect, HostListener, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map, Subject, Subscription } from 'rxjs';
import { MaintenanceCompany, MaintenanceCompanyRequest, MaintenanceCompanyDetail, ContactPerson } from '../../../core/models/maintenance-company-modal';

import { DropdownItem, DropDownServices } from '../../../core/services/drop-down-services';
import { MaintenanceCompanyServices } from '../../../core/services/maintenance-company-services';
import { LazyDropdownComponent } from '../../../shared/ui/lazy-dropdown/lazy-dropdown.component';

@Component({
  imports: [ReactiveFormsModule, LazyDropdownComponent],
  selector: 'app-maintenance-Company-modal',
  styleUrl: './maintenance-compnaey-modal.component.css',
  templateUrl: './maintenance-compnaey-modal.component.html',
})
export class MaintenanceCompyModalComponent {
 private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(MaintenanceCompanyServices);
  private readonly dropdown = inject(DropDownServices);
  private readonly destroyRef = inject(DestroyRef);
 
  readonly company = input<MaintenanceCompany | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
 
  readonly saved = output<MaintenanceCompanyRequest>();
  readonly cancelled = output<void>();

  readonly specialties = signal<DropdownItem<number>[]>([]);
  readonly specialtyPage = signal(0);
  readonly specialtyHasMore = signal(false);
  readonly specialtyLoading = signal(false);
  readonly specialtySearch = signal('');
  readonly specialtyNoResults = signal(false);
  readonly specialtySearchPending = signal(false);
  private readonly specialtySearch$ = new Subject<string>();
  private specialtySub?: Subscription;
 
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
    specialtyId: this.fb.control<number | null>(null),
    specialtyName: this.fb.control(''),
    contactPeople: this.fb.array([contactGroup(this.fb)]),
  });
 
  get contacts() {
    return this.form.controls.contactPeople;
  }
 
  constructor() {
    this.loadSpecialties(true);
    this.specialtySearch$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadSpecialties(true));

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
      specialtyName: '',
    });
    if (d.specialtyName && !this.specialties().some((specialty) => specialty.id === d.specialtyId)) {
      this.specialties.update((specialties) => [...specialties, { id: d.specialtyId, name: d.specialtyName! }]);
    }
    this.contacts.clear();
    d.contactPeople.forEach((c) => this.contacts.push(contactGroup(this.fb, c)));
    if (!d.contactPeople.length) this.addContact();
  }
 
  addContact(): void {
    this.contacts.push(contactGroup(this.fb));
  }

  onSpecialtySearch(term: string): void {
    this.specialtySearch.set(term);
    this.specialtyNoResults.set(false);
    this.specialtySearchPending.set(true);
    this.form.patchValue({ specialtyId: null, specialtyName: term.trim() });
    this.specialtySearch$.next(term.trim());
  }

  selectSpecialty(id: number): void {
    this.form.patchValue({ specialtyId: id, specialtyName: '' });
    this.specialtyNoResults.set(false);
  }

  selectNewSpecialty(name: string): void {
    const specialtyName = name.trim();
    if (!specialtyName) return;
    this.specialtySearch.set(specialtyName);
    this.form.patchValue({ specialtyId: null, specialtyName });
    this.specialtyNoResults.set(true);
  }

  clearSpecialty(): void {
    this.specialtySearch.set('');
    this.specialtySearchPending.set(false);
    this.form.patchValue({ specialtyId: null, specialtyName: '' });
    this.specialtyNoResults.set(false);
    this.specialtySearch$.next('');
  }

  loadSpecialties(reset = false): void {
    if ((!reset && this.specialtyLoading()) || (!reset && !this.specialtyHasMore())) return;
    if (reset) {
      this.specialtySub?.unsubscribe();
      this.specialtyPage.set(0);
      this.specialtyHasMore.set(false);
      this.specialties.set([]);
    }
    const pageNumber = reset ? 1 : this.specialtyPage() + 1;
    const search = this.specialtySearch().trim();
    this.specialtyLoading.set(true);
    this.specialtySub = this.dropdown.maintenanceCompanySpecialties({ pageNumber, pageSize: 10, search })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const page = response.data;
          const items = reset ? [...page.data] : [...this.specialties(), ...page.data];
          const detail = this.detailsResource.hasValue() ? this.detailsResource.value() : null;
          if (detail && !items.some((specialty) => specialty.id === detail.specialtyId)) {
            items.push({ id: detail.specialtyId, name: detail.specialtyName ?? '' });
          }
          this.specialties.set(items);
          this.specialtyPage.set(page.currentPage);
          this.specialtyHasMore.set(page.hasNextPage);
          this.specialtyNoResults.set(!!search && page.data.length === 0 && pageNumber === 1);
          this.specialtySearchPending.set(false);
          this.form.controls.specialtyName.setValue(this.specialtyNoResults() ? search : '');
          this.specialtyLoading.set(false);
        },
        error: () => {
          this.specialtyLoading.set(false);
          this.specialtySearchPending.set(false);
          this.specialtyNoResults.set(!!search);
          this.form.controls.specialtyName.setValue(search);
        },
      });
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

    if (this.form.controls.specialtyId.value === null && !this.form.controls.specialtyName.value.trim()) {
      this.form.controls.specialtyId.markAsTouched();
      return;
    }
 
    const v = this.form.getRawValue();
    this.saved.emit({
      name: v.name.trim(),
      address: v.address.trim(),
      notes: v.notes.trim(),
      specialtyId: v.specialtyId,
      newSpecialtyName: v.specialtyId === null ? this.specialtySearch().trim() || v.specialtyName.trim() || null : null,
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
