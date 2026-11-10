import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ChecklistServices } from '../../core/services/checklist-services';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from 'ngx-sonner';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { CheckList, CheckListStatus } from '../../core/models/checklist-modal';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { FormsModule } from '@angular/forms';
import { CheckListModalComponent } from './check-list-modal/check-list-modal.component';

import { AuthService } from '../../core/auth/auth-service/auth-service';
type StatusTab = { label: string; value: CheckListStatus | null };

@Component({
  imports: [FormsModule, HasPermissionDirective, CheckListModalComponent, RouterOutlet],
  selector: 'app-check-lists',
  styleUrl: './check-lists.component.css',
  templateUrl: './check-lists.component.html',
})
export class CheckListsComponent {
  readonly language = inject(AuthService).language;
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(ChecklistServices);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly searchDebounceMs = 400;
  // hard-coded on purpose: the backend has no endpoint for statuses
  readonly statusTabs: StatusTab[] = [
    { label: 'All', value: null },
    { label: 'Active', value: 'Active' },
    { label: 'Completed', value: 'Completed' },
  ];

  private readonly search$ = new Subject<string>();
  private lastSearch = '';
  private loadSub?: Subscription;

  checkLists = signal<CheckList[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  search = signal('');
  status = signal<CheckListStatus | null>(null);
  pageNumber = signal(1);
  pageSize = signal(10);
  totalPages = signal(1);
  totalCount = signal(0);

  modalOpen = signal(false);
  editingId = signal<string | null>(null);

  deleteTarget = signal<CheckList | null>(null);
  deleting = signal(false);
  deleteError = signal<string | null>(null);
  auditViewOpen = signal(false);
  private auditClosedSubscription?: { unsubscribe(): void };

  from = computed(() =>
    this.totalCount() === 0 ? 0 : (this.pageNumber() - 1) * this.pageSize() + 1,
  );
  to = computed(() => Math.min(this.pageNumber() * this.pageSize(), this.totalCount()));

  constructor() {
    this.search$
      .pipe(debounceTime(this.searchDebounceMs), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const term = this.search().trim();
        if (term === this.lastSearch) return;
        this.lastSearch = term;
        this.pageNumber.set(1);
        this.load();
      });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.loadSub?.unsubscribe();
    this.loadSub = this.service
      .list({
        pageNumber: this.pageNumber(),
        pageSize: this.pageSize(),
        search: this.search(),
        status: this.status(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const page = res?.data;
          if (res?.succeeded === false || !Array.isArray(page?.data)) {
            this.error.set(this.apiError(res) ?? 'The check lists response was invalid.');
            this.loading.set(false);
            return;
          }
          this.checkLists.set(page.data);
          this.totalPages.set(Math.max(1, Number(page.totalPages) || 1));
          this.totalCount.set(Math.max(0, Number(page.totalCount) || 0));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(this.apiError(err) ?? 'Could not load check lists.');
        },
      });
  }

  onSearch(term: string): void {
    this.search.set(term);
    this.search$.next(term);
  }

  setStatus(value: CheckListStatus | null): void {
    if (this.status() === value) return;
    this.status.set(value);
    this.pageNumber.set(1);
    this.load();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(+size);
    this.pageNumber.set(1);
    this.load();
  }

  prev(): void {
    if (this.pageNumber() <= 1) return;
    this.pageNumber.update((p) => p - 1);
    this.load();
  }

  next(): void {
    if (this.pageNumber() >= this.totalPages()) return;
    this.pageNumber.update((p) => p + 1);
    this.load();
  }

  // ---------- modal ----------
  add(): void {
    this.editingId.set(null);
    this.modalOpen.set(true);
  }

  edit(row: CheckList): void {
    this.editingId.set(row.id);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
  }

  onSaved(): void {
    this.closeModal();
    this.load();
  }

  // ---------- nested audit route ----------
  runAudit(row: CheckList): void {
    this.router.navigate([row.id, 'audit'], { relativeTo: this.route });
  }

  closeAudit(): void {
    void this.router.navigateByUrl('/app/check-lists');
  }

  onAuditActivate(component: unknown): void {
    this.auditViewOpen.set(true);
    const closeOutput = (component as { closed?: { subscribe: (callback: () => void) => { unsubscribe(): void } } })
      ?.closed;
    this.auditClosedSubscription?.unsubscribe();
    this.auditClosedSubscription = closeOutput?.subscribe(() => this.closeAudit());
  }

  onAuditDeactivate(): void {
    this.auditClosedSubscription?.unsubscribe();
    this.auditClosedSubscription = undefined;
    const wasOpen = this.auditViewOpen();
    this.auditViewOpen.set(false);
    if (wasOpen && this.router.url.startsWith('/app/check-lists')) this.load();
  }

  initials(name: string): string {
    return (name?.trim().charAt(0) || '?').toUpperCase();
  }

  // ---------- delete ----------
  openDelete(row: CheckList): void {
    this.deleteError.set(null);
    this.deleteTarget.set(row);
  }

  cancelDelete(): void {
    if (this.deleting()) return;
    this.deleteTarget.set(null);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set(null);

    this.service
      .delete(target.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (response?.succeeded === false) {
            this.deleting.set(false);
            this.deleteError.set(this.apiError(response) ?? 'Could not delete the check list.');
            return;
          }
          this.deleting.set(false);
          this.deleteTarget.set(null);
          toast.success('Check list deleted successfully');
          if (this.checkLists().length === 1 && this.pageNumber() > 1) {
            this.pageNumber.update((p) => p - 1);
          }
          this.load();
        },
        error: (err) => {
          this.deleting.set(false);
          // 400 = completed or already has results; the backend sends a translated message
          this.deleteError.set(this.apiError(err) ?? 'Could not delete the check list.');
          toast.error('Could not delete check list');
        },
      });
  }

  private apiError(error: any): string | null {
    const body = error?.error ?? error;
    const errors = body?.errors;
    const detail = Array.isArray(errors)
      ? errors.filter((value: unknown): value is string => typeof value === 'string').join(' ')
      : errors && typeof errors === 'object'
        ? Object.values(errors)
            .flatMap((value) => (Array.isArray(value) ? value : [value]))
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
        : typeof errors === 'string'
          ? errors
          : '';
    return body?.message || detail || null;
  }
}
