export type Role = 'CLIENT' | 'DRIVER' | 'ADMIN';

export interface User {
  sub: number;
  role: Role;
  email: string;
  clientId?: number | null;
  driverId?: number | null;
}

interface SignupBase {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface ClientSignupInput extends SignupBase {
  role: 'CLIENT';
  paymentMethod?: 'MULTIBANCO' | 'MBWAY';
}

export type FuelType = 'Electric' | 'Gasoline' | 'Diesel' | 'Hybrid';

export interface DriverSignupInput extends SignupBase {
  role: 'DRIVER';
  licenseNumber: string;
  vehicle: {
    plate: string;
    brand?: string;
    model?: string;
    year?: number;
    fuelType: FuelType;
    vehicleType: 'AI' | 'NOAI';
  };
}

export type SignupInput = ClientSignupInput | DriverSignupInput;

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
  ORIGIN_ADDRESS: string | null;
  DEST_NAME: string | null;
  DEST_LAT: number | null;
  DEST_LONG: number | null;
  DRIVER_ID: number | null;
  DRIVER_NAME: string | null;
  DRIVER_LAT: number | null;
  DRIVER_LONG: number | null;
  DRIVER_RATING: number | null;
  CLIENT_NAME: string | null;
  CLIENT_LAT: number | null;
  CLIENT_LONG: number | null;
  VEHICLE_PLATE: string | null;
  VEHICLE_DESC: string | null;
  PROPOSED_VALUE: number | null; // cancellation fee once CANCELLED
  FARE: number | null; // final fare once COMPLETED
  TRIP_KM: number | null;
  RATING: number | null; // the client's score for this trip
}

export interface Estimate {
  km: number | null;
  fare: number | null;
  cancelFee: number;
}

export interface Quote {
  km: number | null;
  fareMin: number | null;
  fareMax: number | null;
  driversNearby: number;
  nearestKm: number | null;
}

export interface HistoryRow {
  REQUEST_ID: number;
  STATUS: string;
  REQUEST_DATE: string;
  ORIGIN_ADDRESS: string | null;
  DEST_NAME: string | null;
  FARE: number | null;
  TRIP_KM: number | null;
  CANCEL_FEE: number | null;
  OTHER_NAME: string | null; // the driver for a client, the client for a driver
  VEHICLE_PLATE: string | null;
  RATING: number | null;
}

export interface DriverInfo {
  DRIVER_ID: number;
  NAME: string;
  STATUS: 'OFFLINE' | 'AVAILABLE' | 'ON_TRIP' | 'DISABLED';
  LATITUDE: number | null;
  LONGITUDE: number | null;
  AVG_SCORE: number | null;
  VEHICLE_PLATE: string | null;
  VEHICLE_DESC: string | null;
  TRIPS_TODAY: number;
  EARNED_TODAY: number;
}

export interface DriverState {
  driver: DriverInfo;
  ride: Ride | null;
  estimate: Estimate | null;
}
