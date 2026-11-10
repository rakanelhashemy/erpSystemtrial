import { Component,
  inject,} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';

import { AuthService } from '../../core/auth/auth-service/auth-service';
@Component({
  imports: [RouterLink, HasPermissionDirective],
  selector: 'app-dashboard',
  styleUrl: './dashboard.component.css',
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  readonly language = inject(AuthService).language;}
