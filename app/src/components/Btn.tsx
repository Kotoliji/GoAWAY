import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';

/** The app's primary / outline / danger button. */
export default function Btn({ label, onPress, busy = false, variant = 'solid', flex }: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: 'solid' | 'outline' | 'danger';
  flex?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        variant === 'outline' && styles.outline,
        variant === 'danger' && styles.danger,
        flex && styles.flex,
        busy && styles.disabled,
      ]}
      onPress={onPress}
      disabled={busy}
    >
      <Text
        style={[
          styles.text,
          variant === 'outline' && styles.textOutline,
          variant === 'danger' && styles.textDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: '#0B5FFF', borderRadius: 12, padding: 16, alignItems: 'center' },
  outline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0B5FFF' },
  danger: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2474B' },
  flex: { flex: 1 },
  disabled: { opacity: 0.6 },
  text: { color: '#fff', fontWeight: '700', fontSize: 16 },
  textOutline: { color: '#0B5FFF' },
  textDanger: { color: '#E2474B' },
});
