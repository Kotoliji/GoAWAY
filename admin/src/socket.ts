import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL, get, getAccess } from './api';

let socket: Socket | null = null;

/** Shared JWT socket. Admin sockets join the `admins` room on the server and
 *  receive every ride:updated and driver:moved. */
export function getSocket(): Socket {
  if (!socket) {
    const s = io(API_URL, { transports: ['websocket'], auth: (cb) => cb({ token: getAccess() }) });
    // An expired token is rejected and not retried: refresh it, then reconnect.
    s.on('connect_error', () => {
      setTimeout(() => {
        get('/me')
          .catch(() => undefined)
          .finally(() => {
            if (socket === s && !s.connected) s.connect();
          });
      }, 3000);
    });
    socket = s;
  }
  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** Subscribe while the component is mounted. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}
