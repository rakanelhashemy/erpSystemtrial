import { Component,
  inject,} from '@angular/core';

import { AuthService } from '../../core/auth/auth-service/auth-service';
@Component({
  imports: [],
  selector: 'app-import',
  styleUrl: './import.component.css',
  templateUrl: './import.component.html',
})
export class ImportComponent {
  readonly language = inject(AuthService).language;}
