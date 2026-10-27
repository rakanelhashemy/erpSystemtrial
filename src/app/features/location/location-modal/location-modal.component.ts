import { Component, computed, inject, input, output, signal } from '@angular/core';
import { LocationItem } from '../../../core/models/location-modal';
import { LocationType } from '../../../core/models/location-type-model';
import { LocationTypeService } from '../../../core/services/location-type-service';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [FormsModule],
  selector: 'app-location-modal',
  styleUrl: './location-modal.component.css',
  templateUrl: './location-modal.component.html',
})
export class LocationModalComponent {
  private readonly typeService = inject(LocationTypeService);
 
  readonly location = input<LocationItem | null>(null);
  readonly businessId = input.required<string>();
  readonly saving = input(false);
  readonly errorMessage = input<string | null>(null);
 
  readonly saved = output<{ name: string; locationTypeId: string }>();
  readonly deleted = output<void>();
  readonly cancelled = output<void>();
 
  readonly name = signal('');
  readonly locationTypeId = signal('');
  readonly types = signal<LocationType[]>([]);
  readonly typesLoading = signal(false);
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
    this.typesLoading.set(true);
    this.typesError.set(null);
    const all: LocationType[] = [];
 
    const fetchPage = (page: number): void => {
      this.typeService
        .list({ businessId: this.businessId(), pageNumber: page, pageSize: 100, search: '' })
        .subscribe({
          next: (res) => {
            all.push(...(res.data?.data ?? []));
            if (res.data?.hasNextPage) {
              fetchPage(page + 1);
            } else {
              this.types.set(all);
              this.typesLoading.set(false);
            }
          },
          error: () => {
            this.typesLoading.set(false);
            this.typesError.set('Could not load location types.');
          },
        });
    };
    fetchPage(1);
  }
 
  submit(): void {
    if (!this.canSave() || this.saving()) return;
    this.saved.emit({ name: this.name().trim(), locationTypeId: this.locationTypeId() });
  }}
