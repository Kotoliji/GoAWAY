import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ScreenProps } from '../navigation/types';

export default function RegisterScreen(_props: ScreenProps<'Register'>) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'CLIENT' | 'DRIVER'>('CLIENT');
  const [linkId, setLinkId] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    try {
      const id = Number(linkId);
      await signUp({
        email: email.trim(),
        password,
        role,
        clientId: role === 'CLIENT' ? id : undefined,
        driverId: role === 'DRIVER' ? id : undefined,
      });
    } catch (e: any) {
      Alert.alert('Registration failed', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create account</Text>

      <View style={styles.roleRow}>
        {(['CLIENT', 'DRIVER'] as const).map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.roleChip, role === r && styles.roleChipActive]}
            onPress={() => setRole(r)}
          >
            <Text style={[styles.roleText, role === r && styles.roleTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password (min 6)" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput
        style={styles.input}
        placeholder={role === 'CLIENT' ? 'Client id (existing)' : 'Driver id (existing)'}
        keyboardType="number-pad"
        value={linkId}
        onChangeText={setLinkId}
      />

      <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Creating…' : 'Create account'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 20, color: '#111' },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  roleChip: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, alignItems: 'center' },
  roleChipActive: { backgroundColor: '#0B5FFF', borderColor: '#0B5FFF' },
  roleText: { fontWeight: '700', color: '#444' },
  roleTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#0B5FFF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
