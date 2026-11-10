import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { BrandingService } from '../../../core/services/branding.service';
import { BusinessContextService } from '../../../core/services/business-context.service';
import { Userservices } from '../../../core/services/userservices';

@Component({
  imports: [],
  selector: 'app-header',
  styleUrl: './header.component.css',
  templateUrl: './header.component.html',
})
export class HeaderComponent {
 readonly branding = inject(BrandingService);
  readonly selectedBusiness = inject(BusinessContextService).selectedBusiness;
  private readonly userServices = inject(Userservices);


  readonly user = this.userServices.currentUser;
  readonly initial = this.userServices.initial;
  readonly role = this.userServices.primaryRole;

  @Input() pageTitle = 'Dashboard';
  @Input() language: 'en' | 'ar' = 'en';
  @Output() toggleMenu = new EventEmitter<void>();
  @Output() editProfile = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  dropdownOpen = false;

  readonly arabicPageTitles: Record<string, string> = {
    'Dashboard': 'لوحة التحكم', 'Businesses': 'الشركات', 'Locations · All Locations': 'المواقع · كل المواقع',
    'Location Types': 'أنواع المواقع', 'Groups': 'المجموعات', 'Asset Inventory': 'مخزون الأصول',
    'Bulk Import Items': 'استيراد الأصناف', 'Depreciation Reports': 'تقارير الإهلاك', 'Departments': 'الأقسام',
    'Suppliers': 'الموردون', 'Maintenance Companies': 'شركات الصيانة', 'Employees': 'الموظفون',
    'Check Item': 'عنصر الفحص', 'Run Audit': 'تنفيذ التدقيق', 'Check Lists': 'قوائم الفحص',
    'Printing': 'الطباعة', 'Transactions': 'المعاملات', 'Users · All Users': 'المستخدمون · كل المستخدمين',
    'Roles & Permission': 'الأدوار والصلاحيات', 'Settings': 'الإعدادات', 'SOE': 'بيان المصروفات', 'Reports': 'التقارير',
  };

  get localizedPageTitle(): string {
    return this.language === 'ar' ? (this.arabicPageTitles[this.pageTitle] ?? this.pageTitle) : this.pageTitle;
  }

  ngOnInit(): void {
   
    if (!this.user()) {
      this.userServices.loadMe().subscribe({
        error: (err) => console.error('Failed to load current user', err),
      });
    }
  }

  onEditProfile(): void {
    this.editProfile.emit();
    this.dropdownOpen = false;
  }

  onLogout(): void {
    this.dropdownOpen = false;
    this.userServices.clear();
    this.logout.emit();
  }
}
