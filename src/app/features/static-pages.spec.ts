import { signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../core/auth/auth-service/auth-service';
import { BrandingService } from '../core/services/branding.service';
import { CheckItemComponent } from './check-item/check-item.component';
import { CheckListsComponent } from './check-lists/check-lists.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DepreciationReportsComponent } from './depreciation-reports/depreciation-reports.component';
import { ImportComponent } from './import/import.component';
import { PrintingComponent } from './printing/printing.component';
import { ReportsComponent } from './reports/reports.component';
import { SettingsComponent } from './settings/settings.component';
import { SoeComponent } from './soe/soe.component';
import { TransactionsComponent } from './transactions/transactions.component';

const staticPages: Array<[string, Type<unknown>]> = [
  ['dashboard', DashboardComponent],
  ['import', ImportComponent],
  ['reports', ReportsComponent],
  ['printing', PrintingComponent],
  ['depreciation reports', DepreciationReportsComponent],
  ['transactions', TransactionsComponent],
  ['checklists', CheckListsComponent],
  ['check item', CheckItemComponent],
  ['statement of expenditure', SoeComponent],
  ['settings', SettingsComponent],
];

describe('static feature pages', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            hasPermission: vi.fn(() => false),
            setLanguage: vi.fn(),
            language: signal<'en' | 'ar'>('en'),
          },
        },
        BrandingService,
      ],
    });
  });

  for (const [name, component] of staticPages) {
    it(`creates and renders the ${name} page`, async () => {
      await TestBed.configureTestingModule({ imports: [component] }).compileComponents();
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      expect(fixture.componentInstance).toBeTruthy();
      expect(fixture.nativeElement).toBeTruthy();
    });
  }
});
