import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { getRideApi, cancelRideApi } from '../api/endpoints';
import { Ride } from '../api/types';
import { ScreenProps } from '../navigation/types';

const LABELS: Record<string, string> = {
  REQUESTED: 'Looking for a driver…',
  ASSIGNED: 'Driver assigned — waiting for them to accept',
  ACCEPTED: 'Driver is on the way',
  PICKED_UP: 'On the trip',
  COMPLETED: 'Trip completed',
  CANCELLED: 'Ride cancelled',
};

export default function RideStatusScreen({ route, navigation }: ScreenProps<'RideStatus'>) {
  const { rideId } = route.params;
  const [ride, setRide] = useState<Ride | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { ride } = await getRideApi(rideId);
      setRide(ride);
    } catch {
      /* keep last state on transient errors */
    }
  }, [rideId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function onCancel() {
    setBusy(true);
    try {
      await cancelRideApi(rideId);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Could not cancel', e?.message ?? 'Unknown error');
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

  const terminal = ride.STATUS === 'COMPLETED' || ride.STATUS === 'CANCELLED';

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{LABELS[ride.STATUS] ?? ride.STATUS}</Text>
      <Text style={styles.req}>Request #{ride.REQUEST_ID}</Text>

      {ride.DRIVER_ID != null && (
        <View style={styles.driverCard}>
          <Text style={styles.driverName}>{ride.DRIVER_NAME ?? `Driver ${ride.DRIVER_ID}`}</Text>
          {ride.DRIVER_RATING != null && (
            <Text style={styles.rating}>★ {Number(ride.DRIVER_RATING).toFixed(2)}</Text>
          )}
        </View>
      )}

      {!terminal && (
        <TouchableOpacity style={[styles.cancel, busy && styles.disabled]} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelText}>{busy ? 'Cancelling…' : 'Cancel ride'}</Text>
        </TouchableOpacity>
      )}

      {terminal && (
        <TouchableOpacity style={styles.done} onPress={() => navigation.goBack()}>
          <Text style={styles.doneText}>Back to home</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: 24, fontWeight: '800', color: '#111', textAlign: 'center' },
  req: { color: '#888', textAlign: 'center', marginTop: 6, marginBottom: 24 },
  driverCard: { backgroundColor: '#F2F6FF', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24 },
  driverName: { fontSize: 18, fontWeight: '700', color: '#0B5FFF' },
  rating: { color: '#444', marginTop: 4 },
  cancel: { borderWidth: 1, borderColor: '#E2474B', borderRadius: 12, padding: 16, alignItems: 'center' },
  cancelText: { color: '#E2474B', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  done: { backgroundColor: '#0B5FFF', borderRadius: 12, padding: 16, alignItems: 'center' },
  doneText: { color: '#fff', fontWeight: '700' },
});
