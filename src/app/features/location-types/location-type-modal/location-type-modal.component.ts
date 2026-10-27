import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { LocationType } from '../../../core/models/location-type-model';
import { LocationTypeService } from '../../../core/services/location-type-service';
import { FormsModule } from '@angular/forms';
import { toast } from 'ngx-sonner';

@Component({
  imports: [FormsModule],
  selector: 'app-location-type-modal',
  styleUrl: './location-type-modal.component.css',
  templateUrl: './location-type-modal.component.html',
})
export class LocationTypeModalComponent {
    private service = inject(LocationTypeService);

  // inputs / outputs
  businessId = input.required<string>();
  businessName = input<string>('');
  locationType = input<LocationType | null>(null); // null = add mode
  saved = output<void>();
  cancelled = output<void>();

  name = linkedSignal(() => this.locationType()?.name ?? '');
  nameError = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  isEdit = computed(() => this.locationType() !== null);

  save(): void {
    if (this.saving()) return;

    const name = this.name().trim();
    if (!name) {
      this.nameError.set(true);
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    const body = { name, businessId: this.businessId() };
    const current = this.locationType();
    const request$ = current
      ? this.service.update(current.id, body)
      : this.service.create(body);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        toast.success(current ? 'Location type updated successfully' : 'Location type created successfully');
        this.saved.emit();
      },
      error: (err) => {
        console.error('Error saving location type:', err);
        this.saving.set(false);
        this.error.set('Could not save the location type. Please try again.');
        toast.error(current ? 'Could not update location type' : 'Could not create location type');
      },
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
