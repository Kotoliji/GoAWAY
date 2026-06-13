import 'dotenv/config';

/** Centralised, typed access to environment configuration. */
export const env = {
  PORT: Number(process.env.PORT ?? 3000),

  DB_USER: process.env.DB_USER ?? 'tvdept',
  DB_PASSWORD: process.env.DB_PASSWORD ?? 'tvdept',
  DB_CONNECT_STRING: process.env.DB_CONNECT_STRING ?? 'localhost:1521/XE',

  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  JWT_ACCESS_TTL: Number(process.env.JWT_ACCESS_TTL ?? 900),
  JWT_REFRESH_TTL: Number(process.env.JWT_REFRESH_TTL ?? 2592000),
};
