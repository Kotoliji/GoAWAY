# TVDEPT Mobile App

Cross-platform (iOS + Android) ride-hailing app built with **Expo SDK 58 +
React Native 0.88 + React 19 + TypeScript**, talking to the TVDEPT API (`../api`).
One app, two roles: the screens follow the signed-in account (rider or driver).

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

Needs Node.js 22+ and the stack running (`docker compose up -d` in the repo root).

```bash
npm install
npx expo start          # scan the QR code with Expo Go (phone on the same Wi-Fi)
```

**API address** (`src/config.ts`): in development the app reuses the address of
the machine serving the bundle and expects the API on port 3000 there — nothing
to configure. Set `EXPO_PUBLIC_API_URL` to override it (the Android emulator
falls back to `http://10.0.2.2:3000`).

Demo logins (password `demo123`): rider `jose.lopes@email.com`, driver
`joao.marques@email.com` — or register a new rider / driver in the app.

### Android APK

`eas.json` has a `preview` profile that builds an installable APK in the Expo
cloud (free account needed). Put your computer's LAN address in
`build.preview.env.EXPO_PUBLIC_API_URL`, then:

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

Plain `http://` to the LAN is allowed in that build (`expo-build-properties`,
`usesCleartextTraffic`) because the demo API has no TLS.

## Next milestones

- Push notifications (FCM) when the app is in the background, payments.
