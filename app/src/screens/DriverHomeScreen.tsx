import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../auth/AuthContext';
import {
  driverStateApi, goOnlineApi, goOfflineApi, acceptRideApi, rejectRideApi,
  pickupRideApi, completeRideApi,
} from '../api/endpoints';
import { DriverState } from '../api/types';
import { getSocket, useSocketEvent } from '../realtime/socket';
import { ScreenProps } from '../navigation/types';
import Btn from '../components/Btn';
import { currentPosition, money } from '../geo';

const POLL_MS = 15000; // safety net; pushes normally arrive over the socket

export default function DriverHomeScreen({ navigation }: ScreenProps<'DriverHome'>) {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [state, setState] = useState<DriverState | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRideId = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await driverStateApi();
      // buzz when a new request lands on this driver
      if (s.ride?.STATUS === 'ASSIGNED' && s.ride.REQUEST_ID !== lastRideId.current) {
        Vibration.vibrate(400);
      }
      lastRideId.current = s.ride?.REQUEST_ID ?? null;
      setState(s);
    } catch {
      /* keep last state on transient errors */
    }
  }, []);

  useSocketEvent('ride:updated', refresh);

  useEffect(() => {
    refresh();
    currentPosition().then((p) => setRegion({ ...p, latitudeDelta: 0.04, longitudeDelta: 0.04 }));
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Stream GPS over the socket while online (riders watch it live).
  const online = state != null && state.driver.STATUS !== 'OFFLINE' && state.driver.STATUS !== 'DISABLED';
  useEffect(() => {
    if (!online) return;
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 5000 },
        (pos) => getSocket().emit('driver:location', { lat: pos.coords.latitude, long: pos.coords.longitude }),
      );
    })();
    return () => sub?.remove();
  }, [online]);

  /** Run an action, then reload the state; errors become an alert. */
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      Alert.alert('Something went wrong', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  const goOnline = () =>
    act(async () => {
      const p = await currentPosition();
      await goOnlineApi(p.latitude, p.longitude);
    });

  const complete = (id: number) =>
    act(async () => {
      const r = await completeRideApi(id);
      Alert.alert('Trip completed', `Fare ${money(r.estimate?.fare)}`);
    });

  if (!state || !region) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0B5FFF" />
      </View>
    );
  }

  const { driver, ride, estimate } = state;
  const pickup = ride?.CLIENT_LAT != null && ride.CLIENT_LONG != null
    ? { latitude: ride.CLIENT_LAT, longitude: ride.CLIENT_LONG } : null;
  const dest = ride?.DEST_LAT != null && ride.DEST_LONG != null
    ? { latitude: ride.DEST_LAT, longitude: ride.DEST_LONG } : null;

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={region} showsUserLocation>
        {pickup && ride?.STATUS !== 'PICKED_UP' && <Marker coordinate={pickup} title="Pickup" pinColor="#18A957" />}
        {dest && <Marker coordinate={dest} title={ride?.DEST_NAME ?? 'Destination'} pinColor="#0B5FFF" />}
      </MapView>

      <View style={styles.topBar}>
        <View style={[styles.pill, online ? styles.pillOn : styles.pillOff]}>
          <Text style={styles.pillText}>{driver.STATUS === 'ON_TRIP' ? 'On trip' : online ? 'Online' : 'Offline'}</Text>
        </View>
        <TouchableOpacity style={styles.flex} onPress={() => navigation.navigate('History')}>
          <Text style={styles.today}>{money(driver.EARNED_TODAY)} · {driver.TRIPS_TODAY} trips today ›</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={signOut} disabled={driver.STATUS === 'ON_TRIP'}>
          <Text style={styles.signout}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { bottom: 24 + insets.bottom }]}>
        {driver.STATUS === 'DISABLED' ? (
          <>
            <Text style={styles.title}>Account disabled</Text>
            <Text style={styles.muted}>Your account was deactivated after low ratings. Contact support.</Text>
          </>
        ) : !online ? (
          <>
            <Text style={styles.title}>You're offline</Text>
            <Text style={styles.muted}>{driver.VEHICLE_DESC} · {driver.VEHICLE_PLATE}</Text>
            <Btn label="Go online" onPress={goOnline} busy={busy} />
          </>
        ) : !ride ? (
          <>
            <Text style={styles.title}>Waiting for requests…</Text>
            <Text style={styles.muted}>New rides near you appear here instantly.</Text>
            <Btn label="Go offline" onPress={() => act(goOfflineApi)} busy={busy} variant="outline" />
          </>
        ) : ride.STATUS === 'ASSIGNED' ? (
          <>
            <Text style={styles.kicker}>New ride request</Text>
            <Text style={styles.title}>{ride.CLIENT_NAME}</Text>
            <Text style={styles.muted}>To {ride.DEST_NAME ?? 'destination'} · {estimate?.km ?? '—'} km</Text>
            <Text style={styles.fare}>{money(estimate?.fare)}</Text>
            <View style={styles.row}>
              <Btn label="Decline" onPress={() => act(() => rejectRideApi(ride.REQUEST_ID))} busy={busy} variant="outline" flex />
              <Btn label="Accept" onPress={() => act(() => acceptRideApi(ride.REQUEST_ID))} busy={busy} flex />
            </View>
          </>
        ) : ride.STATUS === 'ACCEPTED' ? (
          <>
            <Text style={styles.kicker}>Heading to pickup</Text>
            <Text style={styles.title}>Pick up {ride.CLIENT_NAME}</Text>
            <Text style={styles.muted}>{ride.ORIGIN_ADDRESS ?? 'Green pin on the map'}</Text>
            <Btn label="Passenger on board" onPress={() => act(() => pickupRideApi(ride.REQUEST_ID))} busy={busy} />
          </>
        ) : (
          <>
            <Text style={styles.kicker}>On trip</Text>
            <Text style={styles.title}>Drive to {ride.DEST_NAME ?? 'destination'}</Text>
            <Text style={styles.muted}>{ride.CLIENT_NAME} · about {money(estimate?.fare)}</Text>
            <Btn label="Complete trip" onPress={() => complete(ride.REQUEST_ID)} busy={busy} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillOn: { backgroundColor: '#18A957' },
  pillOff: { backgroundColor: '#888' },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  today: { color: '#333', fontWeight: '600' },
  signout: { color: '#0B5FFF', fontWeight: '600' },
  card: {
    position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: '#fff',
    borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  kicker: { color: '#0B5FFF', fontWeight: '700', textTransform: 'uppercase', fontSize: 12, marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '800', color: '#111' },
  muted: { color: '#666', marginTop: 4, marginBottom: 12 },
  fare: { fontSize: 28, fontWeight: '800', color: '#111', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
});
