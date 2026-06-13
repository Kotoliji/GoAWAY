import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ScreenProps } from '../navigation/types';

export default function LoginScreen({ navigation }: ScreenProps<'Login'>) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Text style={styles.brand}>TVDEPT</Text>
      <Text style={styles.subtitle}>Sign in to ride</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>No account? Create one</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  brand: { fontSize: 36, fontWeight: '800', color: '#0B5FFF', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16,
  },
  button: { backgroundColor: '#0B5FFF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  link: { color: '#0B5FFF', textAlign: 'center', marginTop: 16, fontSize: 15 },
});
