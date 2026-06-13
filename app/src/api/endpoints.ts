import { apiRequest } from './client';
import { API_BASE_URL } from '../config';
import { AuthResponse, Ride, User } from './types';

// --- auth ---
export function loginApi(email: string, password: string) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function registerApi(input: {
  email: string;
  password: string;
  role: 'CLIENT' | 'DRIVER';
  clientId?: number;
  driverId?: number;
}) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function meApi() {
  return apiRequest<{ user: User }>('/me');
}

export function logoutApi(refreshToken: string) {
  // logout is best-effort; ignore failures
  return fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}

// --- rides ---
export function createRideApi(input: {
  vehicleType: 'AI' | 'NOAI';
  destName?: string;
  destLat?: number;
  destLong?: number;
  radiusKm?: number;
}) {
  return apiRequest<{ allocated: boolean; ride: Ride }>('/rides', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getRideApi(id: number) {
  return apiRequest<{ ride: Ride }>(`/rides/${id}`);
}

export function estimateApi(id: number) {
  return apiRequest<{ km: number | null; fare: number | null }>(`/rides/${id}/estimate`);
}

export function cancelRideApi(id: number) {
  return apiRequest<{ ride: Ride }>(`/rides/${id}/cancel`, { method: 'POST' });
}
