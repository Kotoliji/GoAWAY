# TVDEPT Mobile App

Cross-platform (iOS + Android) ride-hailing app built with **Expo + React Native
+ TypeScript**, talking to the TVDEPT API (`../api`).

## What's here

- **Auth**: login / register, JWT stored in `expo-secure-store`, auto-refresh on 401.
- **Rider flow**: map home (current location via `expo-location`, `react-native-maps`),
  tap to set a destination, **Request ride** → `POST /rides` (runs your
  `aloca_motorista`), then a live **ride status** screen that polls until the
  driver is assigned / on the way / completed, with cancel.
- **Driver**: minimal online screen (full incoming-request flow lands with push/WebSocket).

## Structure

```
app/
├── App.tsx
├── app.json / app config
└── src/
    ├── config.ts             # API base URL (set your LAN IP!)
    ├── api/                  # typed client + endpoints + types
    ├── auth/                 # token storage + AuthContext
    ├── navigation/           # stack: Auth | Rider | Driver
    └── screens/              # Login, Register, RiderHome, RideStatus, DriverHome
```

## Run it

1. Start the API (`../api`, `npm run dev`).
2. Set **`src/config.ts` → `API_BASE_URL`** to your computer's LAN IP, e.g.
   `http://192.168.1.20:3000` (a phone can't reach `localhost`; Android emulator
   uses `http://10.0.2.2:3000`).
3. Install and start Expo:
   ```bash
   npm install
   npx expo start
   ```
4. Open in **Expo Go** (scan the QR) or an emulator (`a` / `i`).

> First-run tip: register a `CLIENT` linked to an existing `clientId` (e.g. `1`)
> so `POST /rides` has a real client behind it.

## Next milestones

- Driver incoming-request screen (needs a `GET /driver/rides` endpoint).
- Real-time driver location on the rider map (WebSocket).
- Push notifications (FCM), payments, trip history.
