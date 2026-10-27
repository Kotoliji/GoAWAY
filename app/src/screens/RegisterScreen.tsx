import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { ScreenProps } from '../navigation/types';
import { FuelType, SignupInput } from '../api/types';

const FUELS: FuelType[] = ['Electric', 'Hybrid', 'Gasoline', 'Diesel'];

/** Small row of selectable chips (role, payment, fuel, vehicle type). */
function Chips<T extends string>({
  options, value, onChange, label = (o) => o,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label?: (o: T) => string;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => (
        <TouchableOpacity
          key={o}
          style={[styles.chip, value === o && styles.chipActive]}
          onPress={() => onChange(o)}
        >
          <Text style={[styles.chipText, value === o && styles.chipTextActive]}>{label(o)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function RegisterScreen(_props: ScreenProps<'Register'>) {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const [role, setRole] = useState<'CLIENT' | 'DRIVER'>('CLIENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [payment, setPayment] = useState<'MBWAY' | 'MULTIBANCO'>('MBWAY');
  // driver + vehicle
  const [license, setLicense] = useState('');
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [fuel, setFuel] = useState<FuelType>('Electric');
  const [vehicleType, setVehicleType] = useState<'NOAI' | 'AI'>('NOAI');
  const [busy, setBusy] = useState(false);

  function buildInput(): SignupInput {
    const base = {
      email: email.trim(),
      password,
      name: name.trim(),
      phone: phone.trim() || undefined,
    };
    if (role === 'CLIENT') return { ...base, role, paymentMethod: payment };
    return {
      ...base,
      role,
      licenseNumber: license.trim(),
      vehicle: {
        plate: plate.trim(),
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        year: year ? Number(year) : undefined,
        fuelType: fuel,
        vehicleType,
      },
    };
  }

  async function onSubmit() {
    setBusy(true);
    try {
      await signUp(buildInput());
    } catch (e: any) {
      Alert.alert('Registration failed', e?.message ?? 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Create account</Text>

      <Chips
        options={['CLIENT', 'DRIVER'] as const}
        value={role}
        onChange={setRole}
        label={(r) => (r === 'CLIENT' ? 'I need rides' : 'I drive')}
      />

      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password (min 6)" secureTextEntry value={password} onChangeText={setPassword} />
      <TextInput style={styles.input} placeholder="Phone (optional)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

      {role === 'CLIENT' ? (
        <>
          <Text style={styles.section}>Payment method</Text>
          <Chips options={['MBWAY', 'MULTIBANCO'] as const} value={payment} onChange={setPayment} />
        </>
      ) : (
        <>
          <TextInput style={styles.input} placeholder="Driving licence number" autoCapitalize="characters" value={license} onChangeText={setLicense} />

          <Text style={styles.section}>Your vehicle</Text>
          <TextInput style={styles.input} placeholder="Plate (e.g. AA-00-BB)" autoCapitalize="characters" value={plate} onChangeText={setPlate} />
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} placeholder="Brand" value={brand} onChangeText={setBrand} />
            <TextInput style={[styles.input, styles.flex]} placeholder="Model" value={model} onChangeText={setModel} />
          </View>
          <TextInput style={styles.input} placeholder="Year" keyboardType="number-pad" value={year} onChangeText={setYear} />
          <Chips options={FUELS} value={fuel} onChange={setFuel} />
          <Chips
            options={['NOAI', 'AI'] as const}
            value={vehicleType}
            onChange={setVehicleType}
            label={(t) => (t === 'AI' ? 'Smart (AI)' : 'Standard')}
          />
        </>
      )}

      <TouchableOpacity style={[styles.button, busy && styles.disabled]} onPress={onSubmit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Creating…' : 'Create account'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 20, color: '#111' },
  section: { fontWeight: '700', color: '#444', marginTop: 4, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { flexGrow: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, alignItems: 'center' },
  chipActive: { backgroundColor: '#0B5FFF', borderColor: '#0B5FFF' },
  chipText: { fontWeight: '700', color: '#444' },
  chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 16 },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  button: { backgroundColor: '#0B5FFF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
