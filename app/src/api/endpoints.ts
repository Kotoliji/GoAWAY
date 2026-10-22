import { apiRequest } from './client';
import { API_BASE_URL } from '../config';
import {
  AuthResponse, DriverInfo, DriverState, Estimate, HistoryRow, Quote, Ride, SignupInput, User,
} from './types';

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
  originAddress?: string;
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

export function quoteApi(q: {
  originLat: number;
  originLong: number;
  destLat: number;
  destLong: number;
  vehicleType: 'AI' | 'NOAI';
}) {
  const params = Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return apiRequest<Quote>(`/rides/quote?${params}`);
}

export function nearbyApi(lat: number, long: number) {
  return apiRequest<{ drivers: { lat: number; long: number }[] }>(`/rides/nearby?lat=${lat}&long=${long}`);
}

export function currentRideApi() {
  return apiRequest<{ ride: Ride | null }>('/rides/current');
}

export function historyApi() {
  return apiRequest<{ rides: HistoryRow[] }>('/rides/history');
}

export function rateRideApi(id: number, score: number, comment?: string) {
  return apiRequest<{ ok: true }>(`/rides/${id}/rate`, {
    method: 'POST',
    body: JSON.stringify({ score, comment: comment || undefined }),
  });
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
