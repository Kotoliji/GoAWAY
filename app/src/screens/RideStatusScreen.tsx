import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { getRideApi, cancelRideApi, estimateApi, rateRideApi } from '../api/endpoints';
import { Estimate, Ride } from '../api/types';
import { ScreenProps } from '../navigation/types';
import { getSocket, useSocketEvent } from '../realtime/socket';
import Btn from '../components/Btn';
import { Point, distanceKm, etaMinutes, money } from '../geo';

const POLL_MS = 20000; // safety net; updates normally arrive over the socket
const LIVE = ['REQUESTED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP'];

const firstName = (name: string | null) => (name ?? 'Your driver').split(' ')[0];

function headline(ride: Ride, car: Point | null, pickup: Point | null): string {
  switch (ride.STATUS) {
    case 'REQUESTED': return 'Looking for a driver…';
    case 'ASSIGNED': return `Waiting for ${firstName(ride.DRIVER_NAME)} to accept`;
    case 'ACCEPTED':
      return car && pickup
        ? `${firstName(ride.DRIVER_NAME)} arrives in ~${etaMinutes(distanceKm(car, pickup))} min`
        : `${firstName(ride.DRIVER_NAME)} is on the way`;
    case 'PICKED_UP': return `Heading to ${ride.DEST_NAME ?? 'your destination'}`;
    case 'COMPLETED': return "You've arrived";
    default: return 'Ride cancelled';
  }
}

export default function RideStatusScreen({ route, navigation }: ScreenProps<'RideStatus'>) {
  const { rideId } = route.params;
  const [ride, setRide] = useState<Ride | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [car, setCar] = useState<Point | null>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const mapRef = useRef<MapView>(null);

  const refresh = useCallback(async () => {
    try {
      setRide((await getRideApi(rideId)).ride);
    } catch {
      /* keep last state on transient errors */
    }
  }, [rideId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Status changes are pushed with the full ride.
  useSocketEvent(
    'ride:updated',
    useCallback((p: { ride: Ride }) => {
      if (p.ride.REQUEST_ID === rideId) setRide(p.ride);
    }, [rideId]),
  );

  // Live car position: watch the assigned driver (again after a re-assignment
  // or a reconnect, since socket rooms do not survive a reconnect).
  const driverId = ride?.DRIVER_ID ?? null;
  const live = ride != null && LIVE.includes(ride.STATUS);
  useEffect(() => {
    if (driverId == null || !live) return;
    const s = getSocket();
    const watch = () => s.emit('ride:watch', { rideId });
    const onMoved = (p: { driverId: number; lat: number; long: number }) => {
      if (p.driverId === driverId) setCar({ latitude: p.lat, longitude: p.long });
    };
    s.on('driver:moved', onMoved);
    s.on('connect', watch);
    watch();
    return () => {
      s.off('driver:moved', onMoved);
      s.off('connect', watch);
      s.emit('ride:unwatch', { driverId });
    };
  }, [driverId, live, rideId]);

  // Fare preview and the current cancellation fee follow the status.
  const status = ride?.STATUS;
  useEffect(() => {
    if (status) estimateApi(rideId).then(setEstimate).catch(() => undefined);
  }, [rideId, status, driverId]);

  const pickup = ride?.CLIENT_LAT != null && ride.CLIENT_LONG != null
    ? { latitude: ride.CLIENT_LAT, longitude: ride.CLIENT_LONG } : null;
  const dest = ride?.DEST_LAT != null && ride.DEST_LONG != null
    ? { latitude: ride.DEST_LAT, longitude: ride.DEST_LONG } : null;

  // Keep everything that matters in view.
  useEffect(() => {
    const pts = [pickup, dest, live ? car : null].filter((p): p is Point => p != null);
    if (pts.length > 1) {
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 60, right: 60, bottom: 320, left: 60 },
        animated: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car?.latitude, car?.longitude, pickup?.latitude, dest?.latitude, live]);

  function onCancel() {
    const fee = estimate?.cancelFee ?? 0;
    Alert.alert(
      'Cancel this ride?',
      fee > 0 ? `A ${money(fee)} cancellation fee applies.` : 'Free — no driver has been assigned yet.',
      [
        { text: 'Keep ride', style: 'cancel' },
        {
          text: 'Cancel ride',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              setRide((await cancelRideApi(rideId)).ride);
            } catch (e: any) {
              Alert.alert('Could not cancel', e?.message ?? 'Unknown error');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function onRate() {
    setBusy(true);
    try {
      await rateRideApi(rideId, score, comment.trim());
      await refresh();
    } catch (e: any) {
      Alert.alert('Could not send rating', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (!ride) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0B5FFF" />
      </View>
    );
  }

  const carPos = car ?? (ride.DRIVER_LAT != null && ride.DRIVER_LONG != null
    ? { latitude: ride.DRIVER_LAT, longitude: ride.DRIVER_LONG } : null);
  const done = () => navigation.popToTop();

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...(pickup ?? dest ?? { latitude: 40.1867, longitude: -8.4155 }), latitudeDelta: 0.03, longitudeDelta: 0.03 }}
      >
        {pickup && ride.STATUS !== 'PICKED_UP' && <Marker coordinate={pickup} title="Pickup" pinColor="#18A957" />}
        {dest && <Marker coordinate={dest} title={ride.DEST_NAME ?? 'Destination'} pinColor="#0B5FFF" />}
        {live && carPos && (
          <Marker coordinate={carPos} anchor={{ x: 0.5, y: 0.5 }} title={ride.DRIVER_NAME ?? 'Driver'}>
            <View style={styles.car}><Text style={styles.carText}>🚗</Text></View>
          </Marker>
        )}
      </MapView>

      <View style={styles.card}>
        <Text style={styles.title}>{headline(ride, carPos, pickup)}</Text>
        {ride.STATUS === 'REQUESTED' && <ActivityIndicator style={styles.spinner} color="#0B5FFF" />}

        {ride.DRIVER_ID != null && live && (
          <View style={styles.driver}>
            <View style={styles.flex}>
              <Text style={styles.driverName}>{ride.DRIVER_NAME}</Text>
              <Text style={styles.muted}>{ride.VEHICLE_DESC} · {ride.VEHICLE_PLATE}</Text>
            </View>
            {ride.DRIVER_RATING != null && <Text style={styles.rating}>★ {Number(ride.DRIVER_RATING).toFixed(1)}</Text>}
          </View>
        )}

        {live && estimate?.fare != null && (
          <Text style={styles.muted}>About {money(estimate.fare)} · {estimate.km} km</Text>
        )}

        {live && ride.STATUS !== 'PICKED_UP' && (
          <View style={styles.actions}>
            <Btn label={busy ? 'Cancelling…' : 'Cancel ride'} variant="danger" onPress={onCancel} busy={busy} />
          </View>
        )}

        {ride.STATUS === 'COMPLETED' && (
          <>
            <Text style={styles.fare}>{money(ride.FARE)}<Text style={styles.muted}>  · {ride.TRIP_KM} km with {firstName(ride.DRIVER_NAME)}</Text></Text>
            {ride.RATING == null ? (
              <>
                <Text style={styles.label}>How was your ride?</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setScore(n)}>
                      <Text style={[styles.star, n <= score && styles.starOn]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="Add a comment (optional)" value={comment} onChangeText={setComment} maxLength={500} />
                <View style={styles.row}>
                  <Btn label="Skip" variant="outline" onPress={done} />
                  <Btn label="Send rating" onPress={onRate} busy={busy || score === 0} flex />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.muted}>You rated this trip {'★'.repeat(ride.RATING)}</Text>
                <View style={styles.actions}><Btn label="Done" onPress={done} /></View>
              </>
            )}
          </>
        )}

        {ride.STATUS === 'CANCELLED' && (
          <>
            <Text style={styles.muted}>
              {ride.PROPOSED_VALUE ? `Cancellation fee ${money(ride.PROPOSED_VALUE)}` : 'No fee was charged.'}
            </Text>
            <View style={styles.actions}><Btn label="Done" onPress={done} /></View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  car: { backgroundColor: '#fff', borderRadius: 16, padding: 3, elevation: 3 },
  carText: { fontSize: 20 },
  card: {
    position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: '#fff',
    borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8 },
  spinner: { marginVertical: 8 },
  driver: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F6FF',
    borderRadius: 12, padding: 12, marginBottom: 8,
  },
  flex: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: '700', color: '#0B5FFF' },
  rating: { fontWeight: '700', color: '#444' },
  muted: { color: '#666', fontSize: 14, fontWeight: '400' },
  fare: { fontSize: 28, fontWeight: '800', color: '#111', marginBottom: 8 },
  label: { fontWeight: '700', color: '#333', marginTop: 4 },
  stars: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  star: { fontSize: 34, color: '#D0D4DC' },
  starOn: { color: '#F5B301' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 15 },
  row: { flexDirection: 'row', gap: 12 },
  actions: { marginTop: 12 },
});
