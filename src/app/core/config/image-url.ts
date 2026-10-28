import { environment } from '../../../environments/environment';

export function toImageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^(https?:|blob:|data:)/i.test(path)) return path;

  const origin = new URL(environment.baseUrl).origin;
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}