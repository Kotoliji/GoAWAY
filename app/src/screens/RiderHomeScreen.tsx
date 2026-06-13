import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import MapView, { Marker, Region, MapPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../auth/AuthContext';
import { createRideApi } from '../api/endpoints';
import { ScreenProps } from '../navigation/types';

const ISEC = { latitude: 40.1867, longitude: -8.4155 };

export default function RiderHomeScreen({ navigation }: ScreenProps<'RiderHome'>) {
  const { signOut } = useAuth();
  const [region, setRegion] = useState<Region | null>(null);
  const [dest, setDest] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setRegion({ ...ISEC, latitudeDelta: 0.05, longitudeDelta: 0.05 });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setRegion({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    })();
  }, []);

  async function requestRide() {
    const target = dest ?? ISEC;
    setBusy(true);
    try {
      const { ride } = await createRideApi({
        vehicleType: 'NOAI',
        destName: dest ? 'Selected destination' : 'ISEC',
        destLat: target.latitude,
        destLong: target.longitude,
        radiusKm: 50,
      });
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
        onPress={(e: MapPressEvent) => setDest(e.nativeEvent.coordinate)}
      >
        {dest && <Marker coordinate={dest} title="Destination" pinColor="#0B5FFF" />}
      </MapView>

      <View style={styles.card}>
        <Text style={styles.hint}>
          {dest ? 'Destination set. Ready to go.' : 'Tap the map to set a destination.'}
        </Text>
        <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={requestRide} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Finding a driver…' : 'Request ride'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signout} onPress={signOut}>
        <Text style={styles.signoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: '#fff',
    borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  hint: { color: '#555', marginBottom: 12 },
  button: { backgroundColor: '#0B5FFF', borderRadius: 12, padding: 16, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  signout: { position: 'absolute', top: 12, right: 16, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, elevation: 3 },
  signoutText: { color: '#0B5FFF', fontWeight: '600' },
});
