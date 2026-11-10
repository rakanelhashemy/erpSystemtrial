import { Component, computed, HostListener, input, output, signal,
  inject,} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Group } from '../../../core/models/group-modal';


import { AuthService } from '../../../core/auth/auth-service/auth-service';
@Component({
  selector: 'app-group-modal',
  imports: [FormsModule],
  templateUrl: './group-modal.component.html',
})
export class GroupModalComponent {
  readonly language = inject(AuthService).language;
  // Inputs
  readonly group = input<Group | null>(null);
  readonly saving = input(false);
  readonly errorMessage = input<string | null>(null);

  // Outputs
  readonly saved = output<{ name: string }>();
  readonly cancelled = output<void>();

  readonly isEdit = computed(() => !!this.group());
  readonly name = signal('');
  readonly nameError = signal(false);

  ngOnInit(): void {
    // المودال بيتعمل من جديد كل مرة بسبب @if، فكفاية نقرأ القيمة هنا
    this.name.set(this.group()?.name ?? '');
  }

  save(): void {
    if (this.saving()) return;

    const value = this.name().trim();
    if (!value) {
      this.nameError.set(true);
      return;
    }
    this.saved.emit({ name: value });
  }

  cancel(): void {
    if (!this.saving()) this.cancelled.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancel();
  }
}