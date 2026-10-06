import { InjectionToken } from '@angular/core';

/**
 * Base URL of the local NestJS API. The default matches PORT in
 * apps/backend/.env.example; provide this token to point elsewhere. It is not
 * a secret: the Anthropic key lives only in the backend environment.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:3001/api',
});
