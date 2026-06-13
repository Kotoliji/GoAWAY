export type Role = 'CLIENT' | 'DRIVER' | 'ADMIN';

export interface User {
  sub: number;
  role: Role;
  email: string;
  clientId?: number | null;
  driverId?: number | null;
}

export interface AuthResponse {
  user: { id: number; email: string; role: Role };
  accessToken: string;
  refreshToken: string;
}

export interface Ride {
  REQUEST_ID: number;
  CLIENT_ID: number;
  STATUS: string;
  VEHICLE_TYPE: string | null;
  DEST_NAME: string | null;
  DEST_LAT: number | null;
  DEST_LONG: number | null;
  DRIVER_ID: number | null;
  DRIVER_NAME: string | null;
  DRIVER_LAT: number | null;
  DRIVER_LONG: number | null;
  DRIVER_RATING: number | null;
}
