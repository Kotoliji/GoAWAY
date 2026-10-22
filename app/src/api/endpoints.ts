import { apiRequest } from './client';
import { API_BASE_URL } from '../config';
import { AuthResponse, DriverInfo, DriverState, Estimate, Ride, SignupInput, User } from './types';

// --- auth ---
export function loginApi(email: string, password: string) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function registerApi(input: SignupInput) {
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
  originLat?: number;
  originLong?: number;
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
  return apiRequest<Estimate>(`/rides/${id}/estimate`);
}

export function cancelRideApi(id: number) {
  return apiRequest<{ ride: Ride }>(`/rides/${id}/cancel`, { method: 'POST' });
}

// --- driver ---
export function driverStateApi() {
  return apiRequest<DriverState>('/driver/state');
}

export function goOnlineApi(lat: number, long: number) {
  return apiRequest<{ driver: DriverInfo }>('/driver/online', {
    method: 'POST',
    body: JSON.stringify({ lat, long }),
  });
}

export function goOfflineApi() {
  return apiRequest<{ driver: DriverInfo }>('/driver/offline', { method: 'POST' });
}

export function acceptRideApi(id: number) {
  return apiRequest<{ ride: Ride }>(`/rides/${id}/accept`, { method: 'POST' });
}

export function rejectRideApi(id: number) {
  return apiRequest<{ ok: true }>(`/rides/${id}/reject`, { method: 'POST' });
}

export function pickupRideApi(id: number) {
  return apiRequest<{ ride: Ride }>(`/rides/${id}/pickup`, { method: 'POST' });
}

export function completeRideApi(id: number) {
  return apiRequest<{ ride: Ride; estimate: Estimate }>(`/rides/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
