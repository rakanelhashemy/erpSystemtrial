import { Component,
  inject,} from '@angular/core';

import { AuthService } from '../../core/auth/auth-service/auth-service';
@Component({
  imports: [],
  selector: 'app-check-item',
  styleUrl: './check-item.component.css',
  templateUrl: './check-item.component.html',
})
export class CheckItemComponent {
  readonly language = inject(AuthService).language;}
