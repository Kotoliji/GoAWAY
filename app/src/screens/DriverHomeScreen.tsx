import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ScreenProps } from '../navigation/types';

/**
 * Minimal driver home. The full driver flow (incoming requests, accept →
 * pickup → complete) is backed by the API; surfacing live assignments here
 * needs a "my assigned rides" endpoint + push/WebSocket (next milestone).
 */
export default function DriverHomeScreen(_props: ScreenProps<'DriverHome'>) {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>You're online</Text>
      <Text style={styles.subtitle}>Driver #{user?.driverId ?? '—'}</Text>
      <Text style={styles.note}>
        Waiting for ride assignments. (Live incoming requests arrive via push
        notifications — coming in the next milestone.)
      </Text>

      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Go offline & sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '800', color: '#0B5FFF', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#444', textAlign: 'center', marginTop: 6 },
  note: { color: '#777', textAlign: 'center', marginTop: 20, lineHeight: 20 },
  button: { backgroundColor: '#0B5FFF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 32 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
