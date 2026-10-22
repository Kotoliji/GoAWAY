import * as Location from 'expo-location';

export interface Point {
  latitude: number;
  longitude: number;
}

/** Fallback when location permission is denied (emulators, demos): ISEC Coimbra. */
export const ISEC: Point = { latitude: 40.1867, longitude: -8.4155 };

/** Current position, or the fallback when permission is denied. */
export async function currentPosition(): Promise<Point> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return ISEC;
  const pos = await Location.getCurrentPositionAsync({});
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

/** Short street-level label for a point ("Rua da Sofia 15"), or null. */
export async function placeName(p: Point): Promise<string | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync(p);
    if (!a) return null;
    const street = [a.street, a.streetNumber].filter(Boolean).join(' ');
    return street || a.name || a.district || a.city || null;
  } catch {
    return null; // geocoder unavailable (no Play Services, offline, …)
  }
}

/** Great-circle distance in km (same formula as the DB's distancia_linear). */
export function distanceKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Rough city driving time: 25 km/h, at least a minute. */
export const etaMinutes = (km: number) => Math.max(1, Math.round((km / 25) * 60));

export const money = (v: number | null | undefined) => `€${Number(v ?? 0).toFixed(2)}`;
