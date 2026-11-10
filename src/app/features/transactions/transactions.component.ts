import { Component,
  inject,} from '@angular/core';

import { AuthService } from '../../core/auth/auth-service/auth-service';
@Component({
  imports: [],
  selector: 'app-transactions',
  styleUrl: './transactions.component.css',
  templateUrl: './transactions.component.html',
})
export class TransactionsComponent {
  readonly language = inject(AuthService).language;}
