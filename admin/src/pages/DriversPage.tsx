import { FormEvent, useState } from 'react';
import { get, post } from '../api';
import { DataTable, Page, Status, useLoad } from '../components/ui';
import { date, dateTime, money, number } from '../format';

interface DriverRow {
  DRIVER_ID: number;
  NAME: string;
  EMAIL: string;
  PHONE: string | null;
  STATUS: string;
  AVG_SCORE: number | null;
  NUM_RATINGS: number | null;
  REGISTRATION_DATE: string;
  VEHICLE: string | null;
  VEHICLE_TYPE: string | null;
  TRIPS: number | null;
  REVENUE: number | null;
  LAST_TRIP: string | null;
  UNPAID: number;
}

const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

/** cancela_motoristas: disable drivers with mostly 1-star months in a period. */
function DeactivateLowRated({ onDone }: { onDone: () => void }) {
  const [vehicleType, setVehicleType] = useState('NOAI');
  const [from, setFrom] = useState(yearAgo());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await post<{ disabled: { DRIVER_ID: number; NAME: string }[] }>('/admin/drivers/deactivate-low-rated', {
        vehicleType, from, to,
      });
      setResult(r.disabled.length ? `Disabled: ${r.disabled.map((d) => d.NAME).join(', ')}` : 'No driver met the criteria.');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Deactivate low-rated drivers</h2>
      <p className="sub">
        Runs <code>cancela_motoristas</code>: disables drivers of a vehicle type whose trips were mostly rated 1★
        in 3 consecutive (or 4 separate) months with 20+ trips, inside the period.
      </p>
      <form className="form-row" onSubmit={run}>
        <div className="field">
          <label htmlFor="vt">Vehicle type</label>
          <select id="vt" className="select" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            <option value="NOAI">Standard (NOAI)</option>
            <option value="AI">Smart (AI)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn danger" disabled={busy}>{busy ? 'Running…' : 'Run'}</button>
      </form>
      {error && <div className="error">{error}</div>}
      {result && <p className="ok">{result}</p>}
    </div>
  );
}

export default function DriversPage() {
  const { data, error, reload } = useLoad(() => get<{ drivers: DriverRow[] }>('/admin/drivers'));
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function setStatus(d: DriverRow, status: 'DISABLED' | 'OFFLINE') {
    const verb = status === 'DISABLED' ? 'Disable' : 'Re-enable';
    if (!window.confirm(`${verb} ${d.NAME}?`)) return;
    setBusyId(d.DRIVER_ID);
    setActionError(null);
    try {
      await post(`/admin/drivers/${d.DRIVER_ID}/status`, { status });
      await reload();
    } catch (e: any) {
      setActionError(`${d.NAME}: ${e?.message ?? 'failed'}`);
    } finally {
      setBusyId(null);
    }
  }

  const needle = q.trim().toLowerCase();
  const rows = (data?.drivers ?? []).filter(
    (d) => !needle || `${d.NAME} ${d.EMAIL} ${d.VEHICLE ?? ''}`.toLowerCase().includes(needle),
  );

  return (
    <Page
      title="Drivers"
      subtitle={data ? `${data.drivers.length} drivers · sorted by lifetime revenue` : undefined}
      actions={<input className="input" placeholder="Search name, email, plate…" value={q} onChange={(e) => setQ(e.target.value)} />}
    >
      <DeactivateLowRated onDone={reload} />
      {(error || actionError) && <div className="error">{actionError ?? error}</div>}
      <div className="card">
        <DataTable
          rowKey={(d) => d.DRIVER_ID}
          rows={rows}
          empty={data ? 'No drivers match.' : 'Loading…'}
          columns={[
            {
              key: 'NAME', label: 'Driver',
              render: (d) => <><div className="strong">{d.NAME}</div><div className="dim">{d.EMAIL}</div></>,
            },
            {
              key: 'VEHICLE', label: 'Vehicle',
              render: (d) => <><div>{d.VEHICLE ?? '—'}</div><div className="dim">{d.VEHICLE_TYPE === 'AI' ? 'Smart' : 'Standard'} · since {date(d.REGISTRATION_DATE)}</div></>,
            },
            { key: 'STATUS', label: 'Status', render: (d) => <Status value={d.STATUS} /> },
            {
              key: 'AVG_SCORE', label: 'Rating', num: true,
              render: (d) => (d.AVG_SCORE != null ? <>★ {Number(d.AVG_SCORE).toFixed(2)} <span className="dim">({number(d.NUM_RATINGS)})</span></> : '—'),
            },
            { key: 'TRIPS', label: 'Trips', num: true, render: (d) => number(d.TRIPS ?? 0) },
            { key: 'REVENUE', label: 'Revenue', num: true, render: (d) => money(d.REVENUE ?? 0) },
            { key: 'UNPAID', label: 'Unpaid', num: true, render: (d) => money(d.UNPAID) },
            { key: 'LAST_TRIP', label: 'Last trip', render: (d) => (d.LAST_TRIP ? dateTime(d.LAST_TRIP) : '—') },
            {
              key: 'action', label: '',
              render: (d) =>
                d.STATUS === 'DISABLED' ? (
                  <button className="btn ghost small" disabled={busyId === d.DRIVER_ID} onClick={() => setStatus(d, 'OFFLINE')}>Re-enable</button>
                ) : (
                  <button className="btn danger small" disabled={busyId === d.DRIVER_ID} onClick={() => setStatus(d, 'DISABLED')}>Disable</button>
                ),
            },
          ]}
        />
      </div>
    </Page>
  );
}
