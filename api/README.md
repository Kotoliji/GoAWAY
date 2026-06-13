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

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness + DB round-trip |
| GET | `/api/geo/distance?lat1&long1&lat2&long2` | Haversine distance via the DB function `distancia_linear` |

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
