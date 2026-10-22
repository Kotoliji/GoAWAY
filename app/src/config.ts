import Constants from 'expo-constants';

// Base URL of the TVDEPT API.
//
// 1. EXPO_PUBLIC_API_URL wins when set (e.g. builds: http://192.168.1.20:3000).
// 2. In development the phone already reaches the dev machine for the JS bundle
//    (Expo's hostUri, "192.168.1.20:8081"), so the API is assumed on port 3000
//    of that same machine — no IP to edit by hand.
// 3. Fallback: the Android emulator's alias for the host machine.
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (devHost ? `http://${devHost}:3000` : 'http://10.0.2.2:3000');
