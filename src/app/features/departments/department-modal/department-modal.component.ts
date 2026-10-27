import { afterNextRender, Component, computed, ElementRef, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { Department } from '../../../core/models/depatment-modal';

@Component({
  imports: [],
  selector: 'app-department-modal',
  styleUrl: './department-modal.component.css',
  templateUrl: './department-modal.component.html',
})
export class DepartmentModalComponent {
  readonly department = input<Department | null>(null); // null = creating
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly saved = output<{ title: string }>();
  readonly cancelled = output<void>();

  // ---------- Form state ----------
  readonly isEdit = computed(() => this.department() !== null);

  /** Prefilled when editing; resets if the parent passes a different department. */
  readonly title = linkedSignal(() => this.department()?.title ?? '');

  private readonly submitted = signal(false);
  readonly titleError = computed(() => this.submitted() && !this.title().trim());

  private readonly titleInput = viewChild.required<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    // focus the field as soon as the modal appears
    afterNextRender(() => this.titleInput().nativeElement.focus());
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.saving()) return;

    this.submitted.set(true);
    const title = this.title().trim();
    if (!title) return;

    this.saved.emit({ title });
  }

  cancel(): void {
    if (!this.saving()) this.cancelled.emit();
  }
}
