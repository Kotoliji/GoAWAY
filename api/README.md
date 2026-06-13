# TVDEPT API

Backend for the TVDEPT ride-hailing platform. **Node + TypeScript + Express**,
talking to **Oracle** via `node-oracledb` (pure-JS *thin* mode — no Oracle client
install needed). Business logic lives in the database (PL/SQL); this API exposes
it over HTTP/JSON.

## Run locally

1. Make sure the database is up and reachable, and the schema is built
   (`../database/install.sql`).
2. Configure the connection:
   ```bash
   cp .env.example .env   # then edit DB_USER / DB_PASSWORD / DB_CONNECT_STRING
   ```
3. Install and start:
   ```bash
   npm install
   npm run dev      # watch mode (ts-node-dev)
   # or
   npm run build && npm start
   ```

## Endpoints (so far)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness + DB round-trip |
| POST | `/auth/register` | — | Create an account (`CLIENT`+`clientId` / `DRIVER`+`driverId` / `ADMIN`) → tokens |
| POST | `/auth/login` | — | Email + password → access + refresh tokens |
| POST | `/auth/refresh` | — | Rotate refresh token → new tokens |
| POST | `/auth/logout` | — | Revoke a refresh token |
| GET | `/me` | Bearer | Current user's claims |
| POST | `/rides` | CLIENT | Request a ride → creates a `trip_request` and runs `aloca_motorista` to assign the nearest driver |
| GET | `/rides/:id` | owner/driver/admin | Ride status + assigned driver |
| GET | `/rides/:id/estimate` | owner/driver/admin | Distance + fare (`FN_REQUEST_DISTANCE` + tariff) |
| POST | `/rides/:id/accept` | DRIVER | Assigned driver accepts (`ASSIGNED → ACCEPTED`) |
| POST | `/rides/:id/pickup` | DRIVER | Pick up passenger — trip starts (creates `trip`, driver `ON_TRIP`) |
| POST | `/rides/:id/complete` | DRIVER | End trip (fires `viagem_Terminada`: frees driver, updates shift, computes fare) |
| POST | `/rides/:id/rate` | CLIENT | Rate a completed trip (`cliente_Avalia` + `TRG_DRIVER_RATING_UPDATE`) |
| POST | `/rides/:id/cancel` | CLIENT | Cancel (`SP_CANCEL_REQUEST`: sets `CANCELLED` + fee) |
| GET | `/api/geo/distance?lat1&long1&lat2&long2` | — | Haversine distance via the DB function `distancia_linear` |

Auth uses JWT access tokens (short-lived) + opaque, rotating refresh tokens
(only their SHA-256 hash is stored). Passwords are bcrypt-hashed. Send the
access token as `Authorization: Bearer <token>`.

Example:
```bash
curl "http://localhost:3000/api/geo/distance?lat1=40.2030&long1=-8.4100&lat2=40.1867&long2=-8.4155"
# => {"km":1.87}
```

## Structure

```
src/
├── config/env.ts          # typed env config
├── db/oracle.ts           # connection pool + withConn() helper
├── common/errors.ts       # HttpError + ORA-208xx → HTTP mapping
├── modules/
│   ├── health/            # GET /health
│   └── geo/               # GET /api/geo/distance
├── app.ts                 # express app wiring
└── index.ts               # bootstrap (pool + server)
```

Database `-208xx` exceptions are translated to proper HTTP status codes in
`common/errors.ts` (e.g. `-20807` → `409 No available driver in range`).
