import { Component,
  inject,} from '@angular/core';

import { AuthService } from '../../core/auth/auth-service/auth-service';
@Component({
  imports: [],
  selector: 'app-printing',
  styleUrl: './printing.component.css',
  templateUrl: './printing.component.html',
})
export class PrintingComponent {
  readonly language = inject(AuthService).language;}
