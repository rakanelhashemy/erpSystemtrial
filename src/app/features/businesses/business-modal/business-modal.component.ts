import {
  ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Business } from '../../../core/models/bussenies-model';
import { BusinessService } from '../../../core/services/bussiness-service';
import { toast } from 'ngx-sonner';


@Component({
  imports: [FormsModule],
  selector: 'app-business-modal',
  styleUrl: './business-modal.component.css',
  templateUrl: './business-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'cancel()' },
})
export class BusinessModalComponent {
  private service = inject(BusinessService);

  // inputs / outputs
  business = input<Business | null>(null); // null = add mode
  saved = output<void>();
  cancelled = output<void>();

  name = linkedSignal(() => this.business()?.name ?? '');
  nameError = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  isEdit = computed(() => this.business() !== null);

  save(): void {
    if (this.saving()) return;

    const name = this.name().trim();
    if (!name) {
      this.nameError.set(true);
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    const current = this.business();
    const request$ = current
      ? this.service.update(current.id,  {name} )
      : this.service.create( {name} );

    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        toast.success(current ? 'Business updated successfully' : 'Business created successfully');
        this.saved.emit();
      },
      error: (res) => {
          console.error('Error saving business:', res);
        this.saving.set(false);
        this.error.set('Could not save the business. Please try again.');
        toast.error(current ? 'Could not update business' : 'Could not create business');
      },
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
