import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { initDb, closeDb } from './db/oracle';
import { env } from './config/env';
import { setupSocket } from './realtime/socket';

async function main() {
  await initDb();
  // eslint-disable-next-line no-console
  console.log('Oracle pool ready');

  const app = createApp();
  const server = http.createServer(app);

  const io = new Server(server, { cors: { origin: '*' } });
  setupSocket(io);

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`TVDEPT API + realtime on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
    io.close();
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Startup failed:', err);
  process.exit(1);
});
