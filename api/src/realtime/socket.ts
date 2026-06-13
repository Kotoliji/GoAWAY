import { Server, Socket } from 'socket.io';
import { verifyAccess, AccessPayload } from '../auth/jwt';
import { getRide } from '../modules/rides/rides.service';
import { updateDriverLocation } from './location.service';

const driverRoom = (driverId: number) => `driver:${driverId}`;

/** Wire up the realtime layer: JWT-authenticated sockets, driver location
 *  streaming, and rider subscriptions to their assigned driver. */
export function setupSocket(io: Server): void {
  // Authenticate every socket from the JWT in the handshake.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing token'));
    try {
      socket.data.user = verifyAccess(token);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AccessPayload;

    // A driver streams its GPS position.
    socket.on('driver:location', async (p: { lat: number; long: number }) => {
      if (user.role !== 'DRIVER' || user.driverId == null) return;
      if (typeof p?.lat !== 'number' || typeof p?.long !== 'number') return;
      try {
        await updateDriverLocation(user.driverId, p.lat, p.long);
      } catch {
        /* ignore transient DB errors on the hot path */
      }
      io.to(driverRoom(user.driverId)).emit('driver:moved', {
        driverId: user.driverId,
        lat: p.lat,
        long: p.long,
      });
    });

    // A rider (or the driver) subscribes to live updates for a ride.
    socket.on('ride:watch', async (p: { rideId: number }) => {
      const ride = await getRide(p.rideId);
      if (!ride || ride.DRIVER_ID == null) return;
      const allowed =
        user.role === 'ADMIN' ||
        (user.clientId != null && user.clientId === ride.CLIENT_ID) ||
        (user.driverId != null && user.driverId === ride.DRIVER_ID);
      if (!allowed) return;

      socket.join(driverRoom(ride.DRIVER_ID));
      if (ride.DRIVER_LAT != null && ride.DRIVER_LONG != null) {
        socket.emit('driver:moved', {
          driverId: ride.DRIVER_ID,
          lat: ride.DRIVER_LAT,
          long: ride.DRIVER_LONG,
        });
      }
    });

    socket.on('ride:unwatch', (p: { driverId: number }) => {
      if (typeof p?.driverId === 'number') socket.leave(driverRoom(p.driverId));
    });
  });
}
