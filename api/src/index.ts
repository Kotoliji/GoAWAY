import { createApp } from './app';
import { initDb, closeDb } from './db/oracle';
import { env } from './config/env';

async function main() {
  await initDb();
  // eslint-disable-next-line no-console
  console.log('Oracle pool ready');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`TVDEPT API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async () => {
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
