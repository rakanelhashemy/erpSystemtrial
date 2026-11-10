import { Component,
  inject,} from '@angular/core';

import { AuthService } from '../../core/auth/auth-service/auth-service';
@Component({
  imports: [],
  selector: 'app-reports',
  styleUrl: './reports.component.css',
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  readonly language = inject(AuthService).language;}
