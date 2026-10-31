import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LocationItem } from '../../../core/models/location-modal';
import { LocationType } from '../../../core/models/location-type-model';
import { LocationTypeService } from '../../../core/services/location-type-service';
import { FormsModule } from '@angular/forms';
import { LazyDropdownComponent, LazyDropdownOption } from '../../../shared/ui/lazy-dropdown/lazy-dropdown.component';

@Component({
  imports: [FormsModule, LazyDropdownComponent],
  selector: 'app-location-modal',
  styleUrl: './location-modal.component.css',
  templateUrl: './location-modal.component.html',
})
export class LocationModalComponent {
  private readonly typeService = inject(LocationTypeService);
  private readonly destroyRef = inject(DestroyRef);
 
  readonly location = input<LocationItem | null>(null);
  readonly businessId = input.required<string>();
  readonly saving = input(false);
  readonly errorMessage = input<string | null>(null);
 
  readonly saved = output<{ name: string; locationTypeId: string }>();
  readonly cancelled = output<void>();
 
  readonly name = signal('');
  readonly locationTypeId = signal('');
  readonly types = signal<LocationType[]>([]);
  readonly typeOptions = computed<LazyDropdownOption[]>(() => this.types().map((type) => ({ id: type.id, name: type.name })));
  readonly typesLoading = signal(false);
  readonly typesHasMore = signal(false);
  readonly typesPage = signal(0);
  readonly typeSearch = signal('');
  readonly typesError = signal<string | null>(null);
 
  readonly isEdit = computed(() => !!this.location());
  readonly canSave = computed(() => !!this.name().trim() && !!this.locationTypeId());
 
  ngOnInit(): void {
    const loc = this.location();
    this.name.set(loc?.name ?? '');
    this.locationTypeId.set(loc?.locationTypeId ?? '');
    this.loadTypes();
  }
 
  /** Loads every page of location types for the business (they are few). */
  loadTypes(): void {
    this.typesPage.set(0);
    this.types.set([]);
    this.loadMoreTypes(true);
  }

  loadMoreTypes(reset = false): void {
    if (this.typesLoading() || (!reset && !this.typesHasMore())) return;
    this.typesLoading.set(true);
    this.typesError.set(null);
    const pageNumber = reset ? 1 : this.typesPage() + 1;
    this.typeService.list({ businessId: this.businessId(), pageNumber, pageSize: 10, search: this.typeSearch().trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const page = res.data;
          this.types.update((current) => reset ? page.data : [...current, ...page.data]);
          const selected = this.location();
          if (selected?.locationTypeId && selected.locationTypeName && !this.types().some((type) => type.id === selected.locationTypeId)) {
            const loadedCount = Math.max(10, page.currentPage * 10);
            this.types.update((items) => [...items.slice(0, loadedCount - 1), { id: selected.locationTypeId!, name: selected.locationTypeName! }]);
          }
          this.typesPage.set(page.currentPage);
          this.typesHasMore.set(page.hasNextPage);
          this.typesLoading.set(false);
        },
        error: () => {
          this.typesLoading.set(false);
          this.typesError.set('Could not load location types.');
        },
      });
  }

  selectLocationType(option: LazyDropdownOption): void {
    this.locationTypeId.set(String(option.id));
  }

 
  submit(): void {
    if (!this.canSave() || this.saving()) return;
    this.saved.emit({ name: this.name().trim(), locationTypeId: this.locationTypeId() });
  }}
