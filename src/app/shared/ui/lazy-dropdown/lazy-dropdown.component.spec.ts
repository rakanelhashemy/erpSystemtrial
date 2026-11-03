import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyDropdownComponent } from './lazy-dropdown.component';

describe('LazyDropdownComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LazyDropdownComponent] }).compileComponents();
  });

  it('shows the selected option label and emits a selection', () => {
    const fixture = TestBed.createComponent(LazyDropdownComponent);
    fixture.componentRef.setInput('options', [
      { id: 'a', name: 'Option A' },
      { id: 'b', name: 'Option B' },
    ]);
    fixture.componentRef.setInput('selectedValue', 'a');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Option A');
    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);
    fixture.nativeElement.querySelector('button[aria-expanded]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[role="option"][aria-selected="false"]').click();

    expect(selected).toHaveBeenCalledWith({ id: 'b', name: 'Option B' });
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('emits clear and custom-selection events', () => {
    const fixture = TestBed.createComponent(LazyDropdownComponent);
    fixture.componentRef.setInput('options', [{ id: 1, name: 'One' }]);
    fixture.componentRef.setInput('selectedValue', 1);
    fixture.componentRef.setInput('allowClear', true);
    fixture.componentRef.setInput('customOptionText', 'Add new');
    fixture.componentRef.setInput('customOptionValue', '  Custom value  ');
    fixture.detectChanges();

    const cleared = vi.fn();
    const customSelected = vi.fn();
    fixture.componentInstance.cleared.subscribe(cleared);
    fixture.componentInstance.customSelected.subscribe(customSelected);
    fixture.nativeElement.querySelector('button[aria-expanded]').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[aria-label="Clear selection"]').click();
    expect(cleared).toHaveBeenCalledOnce();

    fixture.componentInstance.openDropdown();
    fixture.detectChanges();
    Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.includes('Add new'))!
      .click();
    expect(customSelected).toHaveBeenCalledWith('Custom value');
  });

  it('requests another page only when the list can load more', () => {
    const fixture = TestBed.createComponent(LazyDropdownComponent);
    fixture.componentRef.setInput('hasMore', true);
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();
    const loadMore = vi.fn();
    fixture.componentInstance.loadMore.subscribe(loadMore);

    const event = {
      target: { scrollTop: 80, clientHeight: 100, scrollHeight: 200 },
    } as unknown as Event;
    fixture.componentInstance.onScroll(event);
    expect(loadMore).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    fixture.componentInstance.onScroll(event);
    expect(loadMore).toHaveBeenCalledOnce();
  });
});
