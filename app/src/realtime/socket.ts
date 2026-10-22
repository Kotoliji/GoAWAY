import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { getAccess } from '../auth/tokens';
import { meApi } from '../api/endpoints';

let socket: Socket | null = null;

/** One shared JWT-authenticated socket. The token is read on every
 *  (re)connect, so a refreshed access token is picked up automatically. */
export function getSocket(): Socket {
  if (!socket) {
    const s = io(API_BASE_URL, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccess() }),
    });
    // The server rejects an expired token and socket.io won't retry on its
    // own: any authed call refreshes the token, then reconnect.
    s.on('connect_error', () => {
      setTimeout(() => {
        meApi()
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

/** Subscribe a component to a server event for as long as it is mounted. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, handler]);
}
