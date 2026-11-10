import { Component,
  inject,} from '@angular/core';

import { AuthService } from '../../core/auth/auth-service/auth-service';
@Component({
  imports: [],
  selector: 'app-soe',
  styleUrl: './soe.component.css',
  templateUrl: './soe.component.html',
})
export class SoeComponent {
  readonly language = inject(AuthService).language;}
