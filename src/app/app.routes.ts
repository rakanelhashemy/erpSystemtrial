import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/auth/auth-service/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },

  {
    path: 'app',
    canActivate: [authGuard],
    canActivateChild: [authGuard, permissionGuard],
    loadComponent: () =>
      import('./layouts/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: { title: 'Dashboard' },
      },
      {
        path: 'businesses',
        loadComponent: () =>
          import('./features/businesses/businesses.component').then((m) => m.BusinessesComponent),
        data: { title: 'Businesses', moduleId: 'm-bus', requiredPermission: 'Permissions.Businesses.View' },
      },

      // Locations
      {
        path: 'locations',
        loadComponent: () =>
          import('./features/location/location.component').then((m) => m.LocationComponent),
        data: {
          title: 'Locations · All Locations',
          moduleId: 'm-loc',
          requiredPermission: 'Permissions.Locations.View',
        },
      },
      {
        path: 'location-types',
        loadComponent: () =>
          import('./features/location-types/location-types.component').then(
            (m) => m.LocationTypesComponent,
          ),
        data: {
          title: 'Location Types',
          moduleId: 'm-loc',
          requiredPermission: 'Permissions.LocationTypes.View',
        },
      },

      {
        path: 'groups',
        loadComponent: () =>
          import('./features/groups/groups.component').then((m) => m.GroupsComponent),
        data: { title: 'Groups', moduleId: 'm-grp', requiredPermission: 'Permissions.Groups.View' },
      },

      // Items
      {
        path: 'items',
        loadComponent: () =>
          import('./features/items/items.component').then((m) => m.ItemsComponent),
        data: { title: 'Asset Inventory', moduleId: 'm-itm', requiredPermission: 'Permissions.Items.View' },
      },
      {
        path: 'bulk-import',
        loadComponent: () =>
          import('./features/import/import.component').then((m) => m.ImportComponent),
        data: {
          title: 'Bulk Import Items',
          moduleId: 'm-itm',
          action: 'add',
          requiredPermission: 'Permissions.Items.View',
          additionalPermission: 'Permissions.Items.Add',
        },
      },
      {
        path: 'depreciation-reports',
        loadComponent: () =>
          import('./features/depreciation-reports/depreciation-reports.component').then(
            (m) => m.DepreciationReportsComponent,
          ),
        data: {
          title: 'Depreciation Reports',
          moduleId: 'm-itm',
          requiredPermission: 'Permissions.Items.View',
        },
      },

      {
        path: 'departments',
        loadComponent: () =>
          import('./features/departments/departments.component').then(
            (m) => m.DepartmentsComponent,
          ),
        data: {
          title: 'Departments',
          moduleId: 'm-dep',
          requiredPermission: 'Permissions.Departments.View',
        },
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./features/suppliers/suppliers.component').then((m) => m.SuppliersComponent),
        data: { title: 'Suppliers', moduleId: 'm-sup', requiredPermission: 'Permissions.Suppliers.View' },
      },
      {
        path: 'maintenance-companies',
        loadComponent: () =>
          import('./features/maintenance-companies/maintenance-companies.component').then(
            (m) => m.MaintenanceCompaniesComponent,
          ),
        data: {
          title: 'Maintenance Companies',
          moduleId: 'm-mnt',
          requiredPermission: 'Permissions.MaintenanceCompanies.View',
        },
      },
      {
        path: 'employees',
        loadComponent: () =>
          import('./features/employees/employees.component').then((m) => m.EmployeesComponent),
        data: { title: 'Employees', moduleId: 'm-emp', requiredPermission: 'Permissions.Employees.View' },
      },

      // Check List
      {
        path: 'check-item',
        loadComponent: () =>
          import('./features/check-item/check-item.component').then((m) => m.CheckItemComponent),
        data: { title: 'Check Item', moduleId: 'm-chk', requiredPermission: 'Permissions.CheckLists.View' },
      },
      {
        path: 'check-lists',
        loadComponent: () =>
          import('./features/check-lists/check-lists.component').then((m) => m.CheckListsComponent),
        data: {
          title: 'Check Lists',
          moduleId: 'm-chk',
          requiredPermission: 'Permissions.CheckLists.View',
        },
      },

      {
        path: 'printing',
        loadComponent: () =>
          import('./features/printing/printing.component').then((m) => m.PrintingComponent),
        data: { title: 'Printing', moduleId: 'm-prt', requiredPermission: 'Permissions.Printing.View' },
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/transactions/transactions.component').then(
            (m) => m.TransactionsComponent,
          ),
        data: {
          title: 'Transactions',
          moduleId: 'm-trx',
          requiredPermission: 'Permissions.Transactions.View',
        },
      },

      // Users
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
        data: {
          title: 'Users · All Users',
          moduleId: 'm-usr',
          requiredPermission: 'Permissions.Users.View',
        },
      },
      {
        path: 'roles',
        loadComponent: () =>
          import('./features/roles/roles.component').then((m) => m.RolesComponent),
        data: {
          title: 'Roles & Permission',
          moduleId: 'm-usr',
          requiredPermission: 'Permissions.Roles.View',
        },
      },

      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
        data: { title: 'Settings', moduleId: 'm-set' },
      },
      {
        path: 'soe',
        loadComponent: () => import('./features/soe/soe.component').then((m) => m.SoeComponent),
        data: { title: 'SOE', moduleId: 'm-soe' },
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
        data: { title: 'Reports', moduleId: 'm-rpt', requiredPermission: 'Permissions.Reports.View' },
      },

      // أي مسار غلط جوه /app يرجع للداشبورد
      { path: '**', redirectTo: 'dashboard' },
    ],
  },

  { path: '**', redirectTo: 'login' },
];
