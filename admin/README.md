# TVDEPT Admin Panel

Browser operations panel for the TVDEPT platform — **React 18 + TypeScript + Vite**,
talking to the TVDEPT API (`../api`). Sign in as an `ADMIN` (demo:
`admin@tvdept.pt` / `demo123`).

## Pages

| Page | What it shows / does |
|---|---|
| **Dashboard** | KPIs (revenue and trips over 30 days, live rides, drivers online, clients, average rating, cancellation rate), completed trips and revenue per month for 24 months (two charts, or a table), requests by status, top drivers. Refreshes on every `ride:updated` push. |
| **Live map** | Leaflet + OpenStreetMap: online drivers (available / on trip) and live rides (pickup → destination). Driver markers move in real time over the socket (`driver:moved`). |
| **Rides** | Latest 200 requests, filterable by status, with route, driver, fare or cancellation fee. |
| **Drivers** | Every driver with vehicle, status, rating, trips, revenue and **unpaid** balance. Disable / re-enable (`app_admin_set_driver_status`: refused mid-trip, held rides go back to the queue). Runs `cancela_motoristas` over a period. |
| **Payouts** | Unpaid balance, **Run payouts** (`paga_aos_motoristas` with minimum amount / interval), payment history. |
| **Reports** | The 13 analytical SQL views of `database/03_views`, browsable as tables. |

Admin sockets join an `admins` room on the server, so every ride change and
driver position reaches the panel without polling.

## Run

With the whole stack in Docker (from the repo root):

```bash
docker compose up -d --build     # admin on http://localhost:8080
```

For development with hot reload (API running on :3000):

```bash
npm install
npm run dev                      # http://localhost:5173
```

The API URL defaults to `http://localhost:3000`; override it with
`VITE_API_URL` (see `.env.example`). It is baked in at build time.

To see it come alive, run the traffic simulator from `../api`:
`npm run simulate`.

## Structure

```
src/
├── api.ts            # fetch wrapper: bearer token, refresh on 401
├── auth.tsx          # sign-in (ADMIN only), session in localStorage
├── socket.ts         # shared JWT socket + useSocketEvent
├── theme.ts          # CSS colour tokens for charts / map (light + dark)
├── format.ts         # money, dates, Oracle column labels
├── components/ui.tsx # Page, Kpi, Status badge, DataTable, useLoad
└── pages/            # Dashboard, LiveMap, Rides, Drivers, Payouts, Reports, Login
```

Pages are lazy-loaded, so Recharts and Leaflet only download where they are used.
