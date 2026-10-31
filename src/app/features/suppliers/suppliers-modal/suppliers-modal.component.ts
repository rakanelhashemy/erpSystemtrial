import { Component, computed, DestroyRef, effect, HostListener, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map, Subject, Subscription } from 'rxjs';
import { Supplier, SupplierRequest, SupplierDetail, ContactPerson } from '../../../core/models/supplires-Modal';
import { DropdownItem } from '../../../core/services/drop-down-services';
import { Suppliers } from '../../../core/services/suppliers-service';
import { DropDownServices } from '../../../core/services/drop-down-services';
import { LazyDropdownComponent } from '../../../shared/ui/lazy-dropdown/lazy-dropdown.component';

@Component({
  imports: [ReactiveFormsModule, LazyDropdownComponent],
  selector: 'app-suppliers-modal',
  styleUrl: './suppliers-modal.component.css',
  templateUrl: './suppliers-modal.component.html',
})
export class SuppliersModalComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(Suppliers);
  private readonly dropdown = inject(DropDownServices);
  private readonly destroyRef = inject(DestroyRef);

  readonly supplier = input<Supplier | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly saved = output<SupplierRequest>();
  readonly cancelled = output<void>();

  readonly categories = signal<DropdownItem<number>[]>([]);
  readonly categoryPage = signal(0);
  readonly categoryHasMore = signal(false);
  readonly categoryLoading = signal(false);
  readonly categorySearch = signal('');
  readonly categoryNoResults = signal(false);
  readonly categorySearchPending = signal(false);
  private readonly categorySearch$ = new Subject<string>();
  private categorySub?: Subscription;

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
    categoryId: this.fb.control<number | null>(null),
    categoryName: this.fb.control(''),
    // the table renders this array; it starts empty
    contactPeople: this.fb.array<ReturnType<typeof contactGroup>>([]),
  });

  // temporary row used to type a new contact before pressing "Add Contact"
  readonly contactDraft = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(100)]),
    position: this.fb.control(''),
    phone: this.fb.control(''),
    email: this.fb.control('', [Validators.email]),
  });

  // index of the contact currently being edited in the draft row (null = adding a new one)
  readonly editingIndex = signal<number | null>(null);

  get contacts() {
    return this.form.controls.contactPeople;
  }

  constructor() {
    this.loadCategories(true);
    this.categorySearch$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadCategories(true));

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
      categoryName: '',
    });
    if (d.categoryName && !this.categories().some((category) => category.id === d.categoryId)) {
      this.categories.update((categories) => [...categories, { id: d.categoryId, name: d.categoryName }]);
    }
    this.contacts.clear();
    d.contactPeople.forEach((c) => this.contacts.push(contactGroup(this.fb, c)));
  }

  addContact(): void {
    const draft = this.contactDraft;
    if (draft.invalid) {
      draft.markAllAsTouched();
      return;
    }
    const v = draft.getRawValue();
    const value = {
      name: v.name.trim(),
      position: v.position.trim(),
      phone: v.phone.trim(),
      email: v.email.trim(),
    };

    const editing = this.editingIndex();
    if (editing !== null) {
      // update the existing contact (its id is preserved)
      this.contacts.at(editing).patchValue(value);
    } else {
      this.contacts.push(contactGroup(this.fb, value));
    }
    this.cancelEdit();
  }

  editContact(index: number): void {
    const c = this.contacts.at(index).getRawValue();
    this.contactDraft.reset({
      name: c.name,
      position: c.position,
      phone: c.phone,
      email: c.email,
    });
    this.editingIndex.set(index);
  }

  cancelEdit(): void {
    this.contactDraft.reset({ name: '', position: '', phone: '', email: '' });
    this.editingIndex.set(null);
  }

  removeContact(index: number): void {
    const editing = this.editingIndex();
    if (editing === index) this.cancelEdit();
    else if (editing !== null && index < editing) this.editingIndex.set(editing - 1);
    this.contacts.removeAt(index);
  }

  onCategorySearch(term: string): void {
    this.categorySearch.set(term);
    this.categoryNoResults.set(false);
    this.categorySearchPending.set(true);
    this.form.patchValue({ categoryId: null, categoryName: term.trim() });
    this.categorySearch$.next(term.trim());
  }

  selectCategory(id: number): void {
    this.form.patchValue({ categoryId: id, categoryName: '' });
    this.categoryNoResults.set(false);
  }

  selectNewCategory(name: string): void {
    const categoryName = name.trim();
    if (!categoryName) return;
    this.categorySearch.set(categoryName);
    this.form.patchValue({ categoryId: null, categoryName });
    this.categoryNoResults.set(true);
  }

  clearCategory(): void {
    this.categorySearch.set('');
    this.categorySearchPending.set(false);
    this.form.patchValue({ categoryId: null, categoryName: '' });
    this.categoryNoResults.set(false);
    this.categorySearch$.next('');
  }

  loadCategories(reset = false): void {
    if ((!reset && this.categoryLoading()) || (!reset && !this.categoryHasMore())) return;
    if (reset) {
      this.categorySub?.unsubscribe();
      this.categoryPage.set(0);
      this.categoryHasMore.set(false);
    }
    const pageNumber = reset ? 1 : this.categoryPage() + 1;
    const search = this.categorySearch().trim();
    if (reset) this.categories.set([]);
    this.categoryLoading.set(true);
    this.categorySub = this.dropdown
      .supplierCategories({ pageNumber, pageSize: 10, search })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const page = response.data;
          const items = reset ? [...page.data] : [...this.categories(), ...page.data];
          const detail = this.detailsResource.hasValue() ? this.detailsResource.value() : null;
          if (detail && !items.some((category) => category.id === detail.categoryId)) {
            items.push({ id: detail.categoryId, name: detail.categoryName });
          }
          this.categories.set(items);
          this.categoryPage.set(page.currentPage);
          this.categoryHasMore.set(page.hasNextPage);
          this.categoryNoResults.set(!!search && page.data.length === 0 && pageNumber === 1);
          this.categorySearchPending.set(false);
          this.form.controls.categoryName.setValue(this.categoryNoResults() ? search : '');
          this.categoryLoading.set(false);
        },
        error: () => {
          this.categoryLoading.set(false);
          this.categorySearchPending.set(false);
          this.categoryNoResults.set(!!search);
          this.form.controls.categoryName.setValue(search);
        },
      });
  }

  submit(): void {
    if (this.saving() || !this.ready()) return;

    // if the user typed a contact but forgot to press "Add Contact", add it automatically
    const d = this.contactDraft.getRawValue();
    if (d.name.trim() || d.position.trim() || d.phone.trim() || d.email.trim()) {
      if (this.contactDraft.invalid) {
        this.contactDraft.markAllAsTouched();
        return;
      }
      this.addContact();
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.form.controls.categoryId.value === null && !this.form.controls.categoryName.value.trim()) {
      this.form.controls.categoryId.markAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.saved.emit({
      name: v.name.trim(),
      address: v.address.trim(),
      notes: v.notes.trim(),
      categoryId: v.categoryId,
      newCategoryName: v.categoryId === null ? this.categorySearch().trim() || v.categoryName.trim() || null : null,
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