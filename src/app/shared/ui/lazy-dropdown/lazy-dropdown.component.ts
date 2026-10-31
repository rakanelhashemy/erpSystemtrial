import { Component, ElementRef, Renderer2, input, output, signal, viewChild, inject, OnDestroy } from '@angular/core';

export interface LazyDropdownOption {
  id: string | number;
  name: string;
}

@Component({
  selector: 'app-lazy-dropdown',
  standalone: true,
  template: `
    <div #dropdownHost class="relative">
      @if (searchable()) {
        <input type="text" class="min-h-12 w-full rounded-xl border border-inkText/12 bg-white px-4 pb-2 pt-5 pr-11 text-sm text-inkText shadow-sm outline-none transition duration-150 placeholder:text-fog/75 hover:border-brass/60 hover:shadow focus:border-brass focus:ring-4 focus:ring-brass/10"
               [value]="open() ? searchTerm() : selectedLabel()"
               [placeholder]="open() ? searchPlaceholder() : placeholder()"
               [attr.aria-expanded]="open()" [attr.aria-label]="label()"
               (focus)="openDropdown()" (click)="openDropdown()"
               (input)="open.set(true); searchChanged.emit($any($event.target).value)" />
      } @else {
        <button type="button" class="w-full rounded-[0.65rem] border border-inkText/15 bg-white/70 px-4 pb-2 pt-5 text-left text-[0.95rem] text-inkText outline-none focus:border-brass"
                [attr.aria-expanded]="open()" (click)="toggle()">
          {{ selectedLabel() }} <span class="float-right" aria-hidden="true">⌄</span>
        </button>
      }
      <span class="pointer-events-none absolute left-4 top-1 text-[0.68rem] font-semibold tracking-wide text-brassDk">{{ label() }}</span>
      @if (searchable()) {
        <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-fog" aria-hidden="true">⌄</span>
      }
      @if (open()) {
        <div class="fixed z-[60] overflow-auto overscroll-contain rounded-xl border border-inkText/10 bg-white shadow-[0_18px_50px_-18px_rgba(19,36,32,0.38)] ring-1 ring-black/5"
             [style.top.px]="menuPosition().top" [style.left.px]="menuPosition().left"
             [style.width.px]="menuPosition().width" [style.max-height.px]="menuPosition().maxHeight"
             role="listbox" [attr.aria-label]="label()" (scroll)="onScroll($event)">
          <div class="sticky top-0 z-10 flex items-center justify-between border-b border-inkText/8 bg-white/95 px-3 py-2 backdrop-blur">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-fog">{{ label() || 'Options' }}</span>
            <span class="flex items-center gap-1">
              @if (allowClear() && selectedValue() !== null) {
                <button type="button" class="rounded-lg px-2 py-1 text-[11px] font-medium text-fog transition hover:bg-ivory hover:text-inkText"
                        aria-label="Clear selection" (click)="clearSelection()">Clear</button>
              }
              <button type="button" class="grid h-7 w-7 place-items-center rounded-lg text-fog transition hover:bg-ink/5 hover:text-inkText focus:outline-none focus:ring-2 focus:ring-brass/40"
                      aria-label="Close dropdown" (click)="closeDropdown()">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg>
              </button>
            </span>
          </div>
          @for (option of options(); track option.id) {
            <button type="button" role="option" [attr.aria-selected]="option.id === selectedValue()"
                    class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-inkText transition hover:bg-ivory focus:bg-ivory focus:outline-none"
                    [class.font-semibold]="option.id === selectedValue()"
                    (click)="select(option)">
              <span class="truncate">{{ option.name }}</span>
              @if (option.id === selectedValue()) {
                <svg class="h-4 w-4 shrink-0 text-brassDk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
              }
            </button>
          }
          @if (customOptionText()) {
            <button type="button" class="block w-full border-t border-inkText/10 px-3 py-2.5 text-left text-sm font-semibold text-brassDk transition hover:bg-ivory"
                    (click)="selectCustomOption()">{{ customOptionText() }}</button>
          }
          @if (loading()) { <p class="border-t border-inkText/5 px-3 py-2.5 text-center text-xs text-fog">Loading more…</p> }
          @else if (!options().length) { <p class="px-3 py-4 text-center text-xs text-fog">No options found.</p> }
        </div>
      }
    </div>
  `,
})
export class LazyDropdownComponent implements OnDestroy {
  readonly options = input<LazyDropdownOption[]>([]);
  readonly selectedValue = input<string | number | null>(null);
  readonly label = input('');
  readonly searchable = input(false);
  readonly searchTerm = input('');
  readonly searchPlaceholder = input('Search…');
  readonly customOptionText = input('');
  readonly customOptionValue = input('');
  readonly placeholder = input('Select…');
  readonly loading = input(false);
  readonly hasMore = input(false);
  readonly allowClear = input(false);
  readonly selected = output<LazyDropdownOption>();
  readonly customSelected = output<string>();
  readonly cleared = output<void>();
  readonly searchChanged = output<string>();
  readonly loadMore = output<void>();
  readonly open = signal(false);
  readonly menuPosition = signal({ top: 0, left: 0, width: 0, maxHeight: 224 });
  private readonly dropdownHost = viewChild<ElementRef<HTMLElement>>('dropdownHost');
  private readonly renderer = inject(Renderer2);
  private removeOpenListeners: (() => void)[] = [];

  selectedLabel(): string {
    const option = this.options().find((item) => item.id === this.selectedValue());
    return option?.name ?? (this.searchable() && this.searchTerm().trim() ? this.searchTerm().trim() : this.placeholder());
  }

  toggle(): void {
    if (this.open()) this.closeDropdown();
    else this.openDropdown();
  }

  openDropdown(): void {
    if (this.open()) return;
    this.open.set(true);
    this.updateMenuPosition();
    this.removeOpenListeners = [
      this.renderer.listen('window', 'resize', () => this.updateMenuPosition()),
      this.renderer.listen('document', 'scroll', () => this.updateMenuPosition(), { capture: true }),
      this.renderer.listen('document', 'pointerdown', (event: PointerEvent) => {
        if (!this.dropdownHost()?.nativeElement.contains(event.target as Node)) this.closeDropdown();
      }, { capture: true }),
      this.renderer.listen('document', 'keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          this.closeDropdown();
        }
      }, { capture: true }),
    ];
  }

  private closeDropdown(): void {
    this.open.set(false);
    this.removeOpenListeners.forEach((remove) => remove());
    this.removeOpenListeners = [];
  }

  ngOnDestroy(): void {
    this.removeOpenListeners.forEach((remove) => remove());
  }

  private updateMenuPosition(): void {
    const host = this.dropdownHost()?.nativeElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const margin = 8;
    const below = Math.max(0, window.innerHeight - rect.bottom - margin);
    const above = Math.max(0, rect.top - margin);
    const openAbove = below < 180 && above > below;
    const maxHeight = Math.max(80, Math.min(224, openAbove ? above : below));
    const top = openAbove ? Math.max(margin, rect.top - maxHeight - 4) : rect.bottom + 4;
    const width = Math.min(rect.width, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    this.menuPosition.set({ top, left, width, maxHeight });
  }

  select(option: LazyDropdownOption): void {
    this.selected.emit(option);
    this.closeDropdown();
  }

  selectCustomOption(): void {
    const value = (this.customOptionValue() || this.customOptionText()).trim();
    if (!value) return;
    this.customSelected.emit(value);
    this.closeDropdown();
  }

  clearSelection(): void {
    this.cleared.emit();
    this.closeDropdown();
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (this.hasMore() && !this.loading() && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      this.loadMore.emit();
    }
  }
}
