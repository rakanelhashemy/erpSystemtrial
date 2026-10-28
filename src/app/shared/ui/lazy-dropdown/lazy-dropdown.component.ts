import { Component, ElementRef, HostListener, input, output, signal, viewChild } from '@angular/core';

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
        <input type="text" class="w-full rounded-[0.65rem] border border-inkText/15 bg-white/70 px-4 pb-2 pt-5 text-[0.95rem] text-inkText outline-none focus:border-brass"
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
        <div class="fixed z-[60] overflow-auto rounded-lg border border-inkText/15 bg-paper shadow-soft"
             [style.top.px]="menuPosition().top" [style.left.px]="menuPosition().left"
             [style.width.px]="menuPosition().width" [style.max-height.px]="menuPosition().maxHeight"
             (scroll)="onScroll($event)">
          <div class="sticky top-0 z-10 flex items-center justify-end border-b border-inkText/10 bg-paper px-2 py-1">
            <button type="button" class="rounded px-2 py-1 text-xs font-semibold text-fog hover:bg-ivory hover:text-inkText"
                    aria-label="Close dropdown" (click)="open.set(false)">Close</button>
          </div>
          @if (allowClear()) {
            <button type="button" class="block w-full px-3 py-2 text-left text-sm text-fog hover:bg-ivory"
                    (click)="clearSelection()">{{ placeholder() }}</button>
          }
          @for (option of options(); track option.id) {
            <button type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-ivory"
                    [class.font-semibold]="option.id === selectedValue()"
                    (click)="select(option)">{{ option.name }}</button>
          }
          @if (customOptionText()) {
            <button type="button" class="block w-full border-t border-inkText/10 px-3 py-2 text-left text-sm font-semibold text-brassDk hover:bg-ivory"
                    (click)="selectCustomOption()">{{ customOptionText() }}</button>
          }
          @if (loading()) { <p class="px-3 py-2 text-center text-xs text-fog">Loading…</p> }
          @else if (!options().length) { <p class="px-3 py-2 text-xs text-fog">No options found.</p> }
        </div>
      }
    </div>
  `,
})
export class LazyDropdownComponent {
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

  selectedLabel(): string {
    const option = this.options().find((item) => item.id === this.selectedValue());
    return option?.name ?? (this.searchable() && this.searchTerm().trim() ? this.searchTerm().trim() : this.placeholder());
  }

  toggle(): void {
    if (this.open()) this.open.set(false);
    else this.openDropdown();
  }

  openDropdown(): void {
    this.open.set(true);
    this.updateMenuPosition();
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

  @HostListener('window:resize')
  @HostListener('document:scroll')
  onViewportChange(): void {
    if (this.open()) this.updateMenuPosition();
  }

  select(option: LazyDropdownOption): void {
    this.selected.emit(option);
    this.open.set(false);
  }

  selectCustomOption(): void {
    const value = (this.customOptionValue() || this.customOptionText()).trim();
    if (!value) return;
    this.customSelected.emit(value);
    this.open.set(false);
  }

  clearSelection(): void {
    this.cleared.emit();
    this.open.set(false);
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (this.hasMore() && !this.loading() && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      this.loadMore.emit();
    }
  }
}
