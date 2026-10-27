import {  Service, signal } from '@angular/core';

export interface BusinessSelection {
  id: string;
  name: string;
}

@Service()
export class BusinessContextService {
  private readonly storageKey = 'selectedBusiness';
  private readonly selection = signal<BusinessSelection | null>(this.readStoredSelection());
  readonly selectedBusiness = this.selection.asReadonly();

  select(business: BusinessSelection): void {
    this.selection.set(business);
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(business));
    } catch {  }
  }

  clear(): void {
    this.selection.set(null);
    try { localStorage.removeItem(this.storageKey); } catch {  }
  }

  private readStoredSelection(): BusinessSelection | null {
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null');
      return value && typeof value.id === 'string' && typeof value.name === 'string' ? value : null;
    } catch { return null; }
  }
}
