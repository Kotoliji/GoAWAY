# TVDEPT Mobile App

Cross-platform (iOS + Android) ride-hailing app built with **Expo + React Native
+ TypeScript**, talking to the TVDEPT API (`../api`).

## What's here

- **Auth**: login / register, JWT stored in `expo-secure-store`, auto-refresh on 401.
- **Rider flow**: map home with free cars nearby; tap to set a destination
  (reverse-geocoded), pick Standard / Smart and see the fare range, distance and
  nearest-car ETA before ordering (`GET /rides/quote`). **Request ride** →
  `POST /rides` (runs `aloca_motorista`). The ride screen follows the trip live
  over the socket — status pushes plus the driver's car moving on the map —
  shows the cancellation fee before cancelling, and asks for a 1–5★ rating at
  the end. **My trips** lists past rides; an active ride is resumed after a
  restart.
- **Driver flow**: go online/offline, new requests arrive instantly over the socket
  (`ride:updated`, with vibration), accept / decline, passenger on board, complete trip;
  GPS is streamed while online; today's trips and earnings in the top bar.

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

- Push notifications (FCM) when the app is in the background, payments.
