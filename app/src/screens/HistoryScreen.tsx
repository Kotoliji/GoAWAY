import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { historyApi } from '../api/endpoints';
import { HistoryRow } from '../api/types';
import { ScreenProps } from '../navigation/types';
import { money } from '../geo';

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#18A957',
  CANCELLED: '#E2474B',
  PICKED_UP: '#0B5FFF',
};

/** Past rides: a client's requests, or the trips a driver drove. */
export default function HistoryScreen({ navigation }: ScreenProps<'History'>) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const isClient = user?.role === 'CLIENT';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await historyApi()).rides);
    } catch {
      setRows((r) => r ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = (rows ?? []).reduce((sum, r) => sum + (r.FARE ?? 0), 0);

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      data={rows ?? []}
      keyExtractor={(r) => String(r.REQUEST_ID)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListHeaderComponent={
        rows && rows.length > 0 ? (
          <Text style={styles.summary}>
            {rows.length} {isClient ? 'rides' : 'trips'} · {money(total)} {isClient ? 'spent' : 'earned'}
          </Text>
        ) : undefined
      }
      ListEmptyComponent={rows ? <Text style={styles.empty}>No trips yet.</Text> : undefined}
      renderItem={({ item: r }) => (
        <TouchableOpacity
          style={styles.row}
          disabled={!isClient}
          onPress={() => navigation.navigate('RideStatus', { rideId: r.REQUEST_ID })}
        >
          <View style={styles.flex}>
            <Text style={styles.dest} numberOfLines={1}>{r.DEST_NAME ?? `Trip #${r.REQUEST_ID}`}</Text>
            <Text style={styles.muted}>
              {new Date(r.REQUEST_DATE).toLocaleString()}{r.OTHER_NAME ? ` · ${r.OTHER_NAME}` : ''}
            </Text>
            {r.RATING != null && <Text style={styles.stars}>{'★'.repeat(r.RATING)}</Text>}
          </View>
          <View style={styles.right}>
            <Text style={styles.amount}>
              {r.FARE != null ? money(r.FARE) : r.CANCEL_FEE ? money(r.CANCEL_FEE) : '—'}
            </Text>
            <Text style={[styles.status, { color: STATUS_COLORS[r.STATUS] ?? '#888' }]}>{r.STATUS.replace('_', ' ')}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#fff' },
  summary: { padding: 16, color: '#444', fontWeight: '700' },
  empty: { padding: 32, textAlign: 'center', color: '#888' },
  row: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  flex: { flex: 1, paddingRight: 12 },
  dest: { fontSize: 16, fontWeight: '700', color: '#111' },
  muted: { color: '#777', marginTop: 2 },
  stars: { color: '#F5B301', marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '800', color: '#111' },
  status: { fontSize: 12, fontWeight: '700', marginTop: 4 },
});
