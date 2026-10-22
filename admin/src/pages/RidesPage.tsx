import { useState } from 'react';
import { get } from '../api';
import { DataTable, Page, Status, useLoad } from '../components/ui';
import { dateTime, money, number } from '../format';
import { useSocketEvent } from '../socket';

interface RideRow {
  REQUEST_ID: number;
  STATUS: string;
  REQUEST_DATE: string;
  ORIGIN_ADDRESS: string | null;
  DEST_NAME: string | null;
  VEHICLE_TYPE: string | null;
  CLIENT_NAME: string;
  DRIVER_NAME: string | null;
  DISTANCE_KM: number | null;
  FARE: number | null;
  CANCEL_FEE: number | null;
}

const FILTERS = ['ALL', 'REQUESTED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

export default function RidesPage() {
  const [status, setStatus] = useState('ALL');
  const { data, error, reload } = useLoad(
    () => get<{ rides: RideRow[] }>(`/admin/rides${status === 'ALL' ? '' : `?status=${status}`}`),
    [status],
  );
  useSocketEvent('ride:updated', reload);

  return (
    <Page title="Rides" subtitle="Latest 200 requests. New activity appears automatically.">
      <div className="chips" style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${status === f ? 'active' : ''}`} onClick={() => setStatus(f)}>
            {f === 'ALL' ? 'All' : f.replace('_', ' ').toLowerCase()}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <DataTable
          rowKey={(r) => r.REQUEST_ID}
          rows={data?.rides ?? []}
          empty={data ? 'No rides with this status.' : 'Loading…'}
          columns={[
            { key: 'REQUEST_ID', label: '#', render: (r) => <span className="dim">{r.REQUEST_ID}</span> },
            { key: 'REQUEST_DATE', label: 'Requested', render: (r) => dateTime(r.REQUEST_DATE) },
            { key: 'CLIENT_NAME', label: 'Client', render: (r) => <span className="strong">{r.CLIENT_NAME}</span> },
            { key: 'DRIVER_NAME', label: 'Driver', render: (r) => r.DRIVER_NAME ?? <span className="dim">—</span> },
            {
              key: 'route', label: 'Route',
              render: (r) => <>{r.ORIGIN_ADDRESS ?? '—'} <span className="dim">→</span> {r.DEST_NAME ?? '—'}</>,
            },
            { key: 'STATUS', label: 'Status', render: (r) => <Status value={r.STATUS} /> },
            { key: 'DISTANCE_KM', label: 'Km', num: true, render: (r) => number(r.DISTANCE_KM) },
            {
              key: 'amount', label: 'Amount', num: true,
              render: (r) => (r.FARE != null ? money(r.FARE) : r.CANCEL_FEE != null ? <span className="dim">fee {money(r.CANCEL_FEE)}</span> : '—'),
            },
          ]}
        />
      </div>
    </Page>
  );
}
