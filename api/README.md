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
| POST | `/auth/register` | — | Sign up as `CLIENT` or `DRIVER` (+ vehicle) — creates the business row and the login in one transaction (`app_register_client` / `app_register_driver`) → tokens |
| POST | `/auth/login` | — | Email + password → access + refresh tokens |
| POST | `/auth/refresh` | — | Rotate refresh token → new tokens |
| POST | `/auth/logout` | — | Revoke a refresh token |
| GET | `/me` | Bearer | Current user's claims |
| GET | `/me/profile` | Bearer | The client, or driver + vehicle, behind the login |
| POST | `/rides` | CLIENT | Request a ride from `originLat/originLong` → creates a `trip_request` and runs `aloca_motorista` to assign the nearest free driver (stays `REQUESTED` if none) |
| GET | `/rides/quote?originLat&originLong&destLat&destLong&vehicleType` | Bearer | Before ordering: distance, fare range, free drivers within 5 km + nearest (`app_quote`) |
| GET | `/rides/nearby?lat&long` | Bearer | Free drivers' positions (cars on the rider's map) |
| GET | `/rides/current` | CLIENT | The client's live ride, if any (resume after restart) |
| GET | `/rides/history` | CLIENT/DRIVER | Latest 50 requests (client) or trips driven (driver), with fare and rating |
| GET | `/rides/:id` | owner/driver/admin | Ride status, driver, vehicle, final fare, rating |
| GET | `/rides/:id/estimate` | owner/driver/admin | Distance + fare (`FN_REQUEST_DISTANCE` + tariff) + current cancellation fee (`FN_CANCEL_FEE`) |
| POST | `/rides/:id/accept` | DRIVER | Assigned driver accepts (`ASSIGNED → ACCEPTED`) |
| POST | `/rides/:id/reject` | DRIVER | Assigned driver declines (`app_driver_reject`: logs `REJECTED`, re-offers to the next driver) |
| POST | `/rides/:id/pickup` | DRIVER | Pick up passenger — trip starts (creates `trip`, driver `ON_TRIP`) |
| POST | `/rides/:id/complete` | DRIVER | End trip (fires `viagem_Terminada`: frees driver, updates shift). Distance defaults to `FN_REQUEST_DISTANCE`, fare to distance × tariff of the vehicle's fuel |
| POST | `/rides/:id/rate` | CLIENT | Rate a completed trip once (`cliente_Avalia` + `TRG_DRIVER_RATING_UPDATE`; 409 if already rated) |
| POST | `/rides/:id/cancel` | CLIENT | Cancel (`SP_CANCEL_REQUEST`: sets `CANCELLED`; free until a driver is assigned) |
| GET | `/driver/state` | DRIVER | Status, vehicle, today's trips/earnings, current ride + estimate |
| POST | `/driver/online` | DRIVER | `{ lat, long }` → `AVAILABLE` (`app_driver_go_online`, refused if `DISABLED`); waiting requests are re-offered |
| POST | `/driver/offline` | DRIVER | `OFFLINE` (refused mid-trip by `update_status`); held requests go to other drivers |
| GET | `/api/geo/distance?lat1&long1&lat2&long2` | — | Haversine distance via the DB function `distancia_linear` |

### Admin (`ADMIN` role)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/overview` | KPIs, completed trips/revenue per month (24 months), requests by status, top drivers |
| GET | `/admin/live` | Live requests + online drivers with positions (live map) |
| GET | `/admin/rides?status=` | Latest 200 requests |
| GET | `/admin/drivers` | All drivers with vehicle, lifetime trips/revenue and unpaid balance |
| POST | `/admin/drivers/:id/status` | `{ status: DISABLED \| OFFLINE }` — disable / re-enable (`app_admin_set_driver_status`; held rides re-dispatched) |
| POST | `/admin/drivers/deactivate-low-rated` | `{ vehicleType, from, to }` → `cancela_motoristas`, returns who was disabled |
| GET | `/admin/payments` | Latest 200 payouts |
| POST | `/admin/payments/run` | `{ minAmount, minDays }` → `paga_aos_motoristas`, returns the payments created |
| GET | `/admin/reports`, `/admin/reports/:key` | The analytical views (`view_a` … `view_k2_`) as `{ columns, rows }` |

Sign-up bodies:

```jsonc
// CLIENT
{ "role": "CLIENT", "email": "ana@mail.pt", "password": "secret1", "name": "Ana", "phone": "912000000", "paymentMethod": "MBWAY" }
// DRIVER
{ "role": "DRIVER", "email": "rui@mail.pt", "password": "secret1", "name": "Rui", "licenseNumber": "C-123456",
  "vehicle": { "plate": "AA-11-BB", "brand": "Tesla", "model": "Model 3", "year": 2022, "fuelType": "Electric", "vehicleType": "AI" } }
```

**Demo logins** (seeded by `database/05_app/05_demo_users.sql`, password `demo123`): every seeded client and driver by their seed email (e.g. client `jose.lopes@email.com`, driver `joao.marques@email.com`) and the admin `admin@tvdept.pt`. Admin accounts cannot be self-registered.

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

## Realtime (Socket.IO)

The server also runs a JWT-authenticated WebSocket layer (`src/realtime/`):

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| client → server | `driver:location` | `{ lat, long }` | A driver streams its GPS (updates the DB) |
| client → server | `ride:watch` | `{ rideId }` | Rider subscribes to its assigned driver |
| server → client | `driver:moved` | `{ driverId, lat, long }` | Live driver position pushed to watchers |
| client → server | `ride:unwatch` | `{ driverId }` | Stop receiving updates |
| server → client | `ride:updated` | `{ ride }` | Pushed to the ride's client and driver (and admins) on every change (assigned, accepted, picked up, completed, cancelled, re-assigned) |

Every socket also joins a personal inbox room (`inbox:client:<id>` / `inbox:driver:<id>`),
which is how `ride:updated` reaches the right people. Admin sockets join `admins` and
also receive every `driver:moved`.

## Demo traffic simulator

```bash
npm run simulate                                   # until Ctrl+C
SIM_DRIVERS=8 SIM_CLIENTS=6 SIM_SECONDS=300 npm run simulate
```

Seeded drivers go online around Coimbra and stream GPS; simulated clients request
rides; drivers accept (sometimes decline), drive to the pickup and the destination,
and finish; clients rate. It only uses the public API and sockets, so every PL/SQL
rule, push and the admin live map run for real. On stop it cancels open requests
and takes the drivers offline.

Connect with the access token in the handshake:
`io(API_URL, { auth: { token } })`.
