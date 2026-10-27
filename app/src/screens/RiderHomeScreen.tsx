import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Region, MapPressEvent } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { createRideApi, currentRideApi, nearbyApi, quoteApi } from '../api/endpoints';
import { Quote, Ride } from '../api/types';
import { ScreenProps } from '../navigation/types';
import Btn from '../components/Btn';
import { Point, currentPosition, placeName, etaMinutes, money } from '../geo';

const CLASSES = [
  { type: 'NOAI', label: 'Standard' },
  { type: 'AI', label: 'Smart (AI)' },
] as const;

export default function RiderHomeScreen({ navigation }: ScreenProps<'RiderHome'>) {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [here, setHere] = useState<Point | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [dest, setDest] = useState<Point | null>(null);
  const [destName, setDestName] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState<'NOAI' | 'AI'>('NOAI');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [cars, setCars] = useState<{ lat: number; long: number }[]>([]);
  const [active, setActive] = useState<Ride | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    currentPosition().then((p) => {
      setHere(p);
      setRegion({ ...p, latitudeDelta: 0.03, longitudeDelta: 0.03 });
    });
  }, []);

  // A ride still in progress (e.g. after an app restart) is shown as a banner.
  useFocusEffect(
    useCallback(() => {
      currentRideApi().then((r) => setActive(r.ride)).catch(() => undefined);
    }, []),
  );

  // Free cars around the rider, refreshed every 15 s.
  useEffect(() => {
    if (!here) return;
    const load = () => nearbyApi(here.latitude, here.longitude).then((r) => setCars(r.drivers)).catch(() => undefined);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [here]);

  // Price + availability for the chosen destination and class.
  useEffect(() => {
    setQuote(null);
    if (!here || !dest) return;
    quoteApi({
      originLat: here.latitude,
      originLong: here.longitude,
      destLat: dest.latitude,
      destLong: dest.longitude,
      vehicleType,
    }).then(setQuote).catch(() => undefined);
  }, [here, dest, vehicleType]);

  async function pickDestination(p: Point) {
    setDest(p);
    setDestName(null);
    setDestName(await placeName(p));
  }

  async function requestRide() {
    if (!here || !dest) return;
    setBusy(true);
    try {
      const { ride, allocated } = await createRideApi({
        vehicleType,
        originLat: here.latitude,
        originLong: here.longitude,
        originAddress: (await placeName(here)) ?? undefined,
        destName: destName ?? 'Pinned location',
        destLat: dest.latitude,
        destLong: dest.longitude,
        radiusKm: 50,
      });
      setDest(null);
      if (!allocated) {
        Alert.alert('Looking for a driver', "No car is free right now — we'll match you as soon as one is.");
      }
      navigation.navigate('RideStatus', { rideId: ride.REQUEST_ID });
    } catch (e: any) {
      Alert.alert('Could not request ride', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  if (!region) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0B5FFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation
        onPress={(e: MapPressEvent) => pickDestination(e.nativeEvent.coordinate)}
      >
        {cars.map((c, i) => (
          <Marker key={i} coordinate={{ latitude: c.lat, longitude: c.long }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.car}><Text style={styles.carText}>🚗</Text></View>
          </Marker>
        ))}
        {dest && <Marker coordinate={dest} title={destName ?? 'Destination'} pinColor="#0B5FFF" />}
      </MapView>

      <View style={styles.topRow}>
        <TouchableOpacity style={styles.chipBtn} onPress={() => navigation.navigate('History')}>
          <Text style={styles.chipBtnText}>My trips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chipBtn} onPress={signOut}>
          <Text style={styles.chipBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {active && (
        <TouchableOpacity style={styles.banner} onPress={() => navigation.navigate('RideStatus', { rideId: active.REQUEST_ID })}>
          <Text style={styles.bannerText}>Ride in progress — tap to view</Text>
        </TouchableOpacity>
      )}

      <View style={[styles.card, { bottom: 24 + insets.bottom }]}>
        {!dest ? (
          <>
            <Text style={styles.title}>Where to?</Text>
            <Text style={styles.muted}>
              Tap the map to set your destination · {cars.length} {cars.length === 1 ? 'car' : 'cars'} nearby
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.title} numberOfLines={1}>{destName ?? 'Pinned location'}</Text>
            <View style={styles.classes}>
              {CLASSES.map((c) => (
                <TouchableOpacity
                  key={c.type}
                  style={[styles.class, vehicleType === c.type && styles.classActive]}
                  onPress={() => setVehicleType(c.type)}
                >
                  <Text style={[styles.classText, vehicleType === c.type && styles.classTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {quote ? (
              <>
                <Text style={styles.price}>
                  {quote.fareMin === quote.fareMax ? money(quote.fareMin) : `${money(quote.fareMin)} – ${money(quote.fareMax)}`}
                  <Text style={styles.muted}>  · {quote.km} km</Text>
                </Text>
                <Text style={styles.muted}>
                  {quote.nearestKm != null
                    ? `Nearest car ~${etaMinutes(quote.nearestKm)} min away · ${quote.driversNearby} nearby`
                    : "No cars nearby right now — you'll be matched when one is free"}
                </Text>
              </>
            ) : (
              <ActivityIndicator style={styles.quoteLoading} color="#0B5FFF" />
            )}
            <View style={styles.row}>
              <Btn label="Clear" variant="outline" onPress={() => setDest(null)} />
              <Btn label={busy ? 'Requesting…' : 'Request ride'} onPress={requestRide} busy={busy || !quote} flex />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  car: { backgroundColor: '#fff', borderRadius: 14, padding: 2, elevation: 2 },
  carText: { fontSize: 16 },
  topRow: { position: 'absolute', top: 12, right: 16, flexDirection: 'row', gap: 8 },
  chipBtn: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, elevation: 3 },
  chipBtnText: { color: '#0B5FFF', fontWeight: '600' },
  banner: {
    position: 'absolute', top: 56, left: 16, right: 16, backgroundColor: '#18A957',
    borderRadius: 12, padding: 12, alignItems: 'center', elevation: 3,
  },
  bannerText: { color: '#fff', fontWeight: '700' },
  card: {
    position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: '#fff',
    borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111' },
  muted: { color: '#666', fontSize: 14, fontWeight: '400' },
  classes: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  class: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 10, alignItems: 'center' },
  classActive: { backgroundColor: '#0B5FFF', borderColor: '#0B5FFF' },
  classText: { fontWeight: '700', color: '#444' },
  classTextActive: { color: '#fff' },
  price: { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 4 },
  quoteLoading: { marginVertical: 16 },
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
});
