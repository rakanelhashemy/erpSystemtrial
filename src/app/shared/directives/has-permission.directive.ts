import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/auth/auth-service/auth-service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  readonly appHasPermission = input.required<string>();
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private visible = false;

  constructor() {
    effect(() => {
      const allowed = this.auth.hasPermission(this.appHasPermission());
      if (allowed && !this.visible) {
        this.container.createEmbeddedView(this.template);
        this.visible = true;
      } else if (!allowed && this.visible) {
        this.container.clear();
        this.visible = false;
      }
    });
  }
}
