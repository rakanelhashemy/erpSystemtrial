
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { BusinessService } from '../../core/services/bussiness-service';
import { BusinessModalComponent } from './business-modal/business-modal.component';
import { Business } from '../../core/models/bussenies-model';
import { Paged } from '../../core/models/general-model';
import { toast } from 'ngx-sonner';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

@Component({
  selector: 'app-businesses',
  imports: [BusinessModalComponent, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './businesses.component.css',
  templateUrl: './businesses.component.html',
})
export class BusinessesComponent {
  private readonly service = inject(BusinessService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly search$ = new Subject<string>();

  readonly pageSizes = [5, 10, 20 ,30, 50];

  readonly searchTerm = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  private readonly result = rxResource({
    params: () => ({
      pageNumber: this.currentPage(),
      pageSize: this.pageSize(),
      search: this.searchTerm(),
    }),
    stream: ({ params }) => this.service.list(params),
  });

  private readonly page = linkedSignal<Paged<Business> | undefined, Paged<Business> | null>({
    source: () => (this.result.hasValue() ? this.result.value().data : undefined),
    computation: (next, prev) => next ?? prev?.value ?? null,
  });

  readonly paged = computed(() => this.page()?.data ?? []);
  readonly totalCount = computed(() => this.page()?.totalCount ?? 0);
  readonly totalPages = computed(() => Math.max(this.page()?.totalPages ?? 1, 1));
  readonly loading = this.result.isLoading;

  readonly error = computed(() =>
    this.result.error() ? 'Failed to load businesses.' : null,
  );

  readonly rangeStart = computed(() =>
    this.totalCount() ? (this.currentPage() - 1) * this.pageSize() + 1 : 0,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.totalCount()),
  );

  // add/edit modal state
  readonly modalOpen = signal(false);
  readonly modalBusiness = signal<Business | null>(null);

  // delete modal state
  readonly isDeleteModalOpen = signal(false);
  readonly businessToDelete = signal<Business | null>(null);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  constructor() {
    this.search$
      .pipe(debounceTime(600), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.currentPage.set(1);
      });

    effect(() => {
      const max = this.totalPages();
      if (this.currentPage() > max) this.currentPage.set(max);
    });
  }

  setSearch(term: string): void {
    this.search$.next(term.trim());
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  prev(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }

  next(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }

  // ---------- add / edit ----------
  openAdd(): void {
    this.modalBusiness.set(null);
    this.modalOpen.set(true);
  }

  openEdit(b: Business): void {
    this.modalBusiness.set(b);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.modalBusiness.set(null);
  }

  onSaved(): void {
    this.closeModal();
    this.result.reload();
  }

  // ---------- delete ----------
  openDeleteModal(b: Business): void {
    this.deleteError.set(null);
    this.businessToDelete.set(b);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    if (this.deleting()) return;
    this.isDeleteModalOpen.set(false);
    this.businessToDelete.set(null);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const b = this.businessToDelete();
    if (!b || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    this.service
      .delete(b.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.closeDeleteModal();
          toast.success('Business deleted successfully');

          if (this.paged().length === 1 && this.currentPage() > 1) {
            this.currentPage.update((p) => p - 1);
          } else {
            this.result.reload();
          }
        },
        error: () => {
          this.deleting.set(false);
          this.deleteError.set(`Could not delete "${b.name}".`);
          toast.error('Could not delete business');
        },
      });
  }
}
