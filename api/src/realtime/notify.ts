import { Server } from 'socket.io';
import { RideRow } from '../modules/rides/rides.service';

// Personal rooms: every authenticated socket joins its own inbox on connect.
export const clientInbox = (clientId: number) => `inbox:client:${clientId}`;
export const driverInbox = (driverId: number) => `inbox:driver:${driverId}`;
// Admins watch everything (the admin panel's live map).
export const ADMINS = 'admins';

let io: Server | undefined;

export function setNotifier(server: Server): void {
  io = server;
}

/** Push the ride's new state to its client and driver (plus any driver who
 *  just lost it, e.g. after a reject or going offline). Event: `ride:updated`. */
export function notifyRide(ride: RideRow | null, alsoDrivers: number[] = []): void {
  if (!io || !ride) return;
  const rooms = new Set<string>([clientInbox(ride.CLIENT_ID), ADMINS]);
  if (ride.DRIVER_ID != null) rooms.add(driverInbox(ride.DRIVER_ID));
  alsoDrivers.forEach((d) => rooms.add(driverInbox(d)));
  io.to([...rooms]).emit('ride:updated', { ride });
}
