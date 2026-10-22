import { useCallback, useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { get } from '../api';
import { DataTable, Kpi, Page, Status, useLoad } from '../components/ui';
import { money, number } from '../format';
import { useSocketEvent } from '../socket';
import { useTokens } from '../theme';

interface Overview {
  kpi: Record<string, number>;
  monthly: { month: string; trips: number; revenue: number }[];
  byStatus: { STATUS: string; N: number }[];
  topDrivers: { DRIVER_ID: number; NAME: string; AVG_SCORE: number | null; TRIPS: number; REVENUE: number }[];
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
};

/** One measure per chart (no dual axis): bars over the last 24 months. */
function MonthlyBars({ data, field, format }: {
  data: Overview['monthly'];
  field: 'trips' | 'revenue';
  format: (v: number) => string;
}) {
  const t = useTokens(['series-1', 'muted', 'grid', 'surface-2']);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={18} />
        <YAxis tickFormatter={(v) => format(v)} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          cursor={{ fill: t['surface-2'] }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="tip">
                <div className="t">{monthLabel(String(payload[0].payload.month))}</div>
                <div className="v">{format(Number(payload[0].value))}</div>
              </div>
            ) : null
          }
        />
        <Bar dataKey={field} fill={t['series-1']} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function DashboardPage() {
  const { data, error, reload } = useLoad(() => get<Overview>('/admin/overview'));
  const [asTable, setAsTable] = useState(false);

  // live: refresh on ride changes (coalesced) and every 30 s
  const timer = useRef<number>();
  const onRide = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(reload, 1500);
  }, [reload]);
  useSocketEvent('ride:updated', onRide);
  useEffect(() => {
    const t = window.setInterval(reload, 30000);
    return () => window.clearInterval(t);
  }, [reload]);

  if (!data) return <Page title="Dashboard">{error ? <div className="error">{error}</div> : <p className="note">Loading…</p>}</Page>;

  const k = data.kpi;
  const totalRequests = data.byStatus.reduce((s, r) => s + r.N, 0);

  return (
    <Page title="Dashboard" subtitle="Platform activity at a glance. Updates live.">
      {error && <div className="error">{error}</div>}
      <div className="grid kpis">
        <Kpi label="Revenue · 30 days" value={money(k.REVENUE_30D)} hint={`${money(k.REVENUE_TODAY)} today`} />
        <Kpi label="Trips · 30 days" value={number(k.TRIPS_30D)} hint={`${number(k.TRIPS_TODAY)} today`} />
        <Kpi label="Live rides" value={number(k.LIVE_RIDES)} hint="requested → on trip" />
        <Kpi label="Drivers online" value={`${k.DRIVERS_ONLINE} / ${k.DRIVERS_TOTAL}`} hint={`${k.DRIVERS_DISABLED} disabled`} />
        <Kpi label="Clients" value={number(k.CLIENTS)} />
        <Kpi label="Avg driver rating" value={k.AVG_RATING != null ? `★ ${k.AVG_RATING}` : '—'} />
        <Kpi label="Cancellation rate" value={k.CANCEL_PCT != null ? `${k.CANCEL_PCT}%` : '—'} hint="of all requests" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="page-head" style={{ marginBottom: 8 }}>
          <div>
            <h2>Completed trips and revenue by month</h2>
            <p className="sub" style={{ margin: 0 }}>Last 24 months</p>
          </div>
          <button className="btn ghost small" onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show charts' : 'Show table'}</button>
        </div>
        {asTable ? (
          <DataTable
            rowKey={(r) => r.month}
            rows={[...data.monthly].reverse()}
            columns={[
              { key: 'month', label: 'Month', render: (r) => monthLabel(r.month) },
              { key: 'trips', label: 'Trips', num: true, render: (r) => number(r.trips) },
              { key: 'revenue', label: 'Revenue', num: true, render: (r) => money(r.revenue) },
            ]}
          />
        ) : (
          <div className="grid two" style={{ marginBottom: 0 }}>
            <div>
              <h3 className="sub" style={{ fontWeight: 700, color: 'var(--text-2)' }}>Trips</h3>
              <MonthlyBars data={data.monthly} field="trips" format={(v) => number(v)} />
            </div>
            <div>
              <h3 className="sub" style={{ fontWeight: 700, color: 'var(--text-2)' }}>Revenue</h3>
              <MonthlyBars data={data.monthly} field="revenue" format={(v) => `€${number(Math.round(v))}`} />
            </div>
          </div>
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Requests by status</h2>
          <p className="sub">All time · {number(totalRequests)} requests</p>
          <DataTable
            rowKey={(r) => r.STATUS}
            rows={data.byStatus}
            columns={[
              { key: 'STATUS', label: 'Status', render: (r) => <Status value={r.STATUS} /> },
              { key: 'N', label: 'Requests', num: true, render: (r) => number(r.N) },
              { key: 'share', label: 'Share', num: true, render: (r) => `${((100 * r.N) / Math.max(1, totalRequests)).toFixed(1)}%` },
            ]}
          />
        </div>
        <div className="card">
          <h2>Top drivers by revenue</h2>
          <p className="sub">All completed trips</p>
          <DataTable
            rowKey={(r) => r.DRIVER_ID}
            rows={data.topDrivers}
            columns={[
              { key: 'NAME', label: 'Driver', render: (r) => <span className="strong">{r.NAME}</span> },
              { key: 'AVG_SCORE', label: 'Rating', num: true, render: (r) => (r.AVG_SCORE != null ? `★ ${Number(r.AVG_SCORE).toFixed(1)}` : '—') },
              { key: 'TRIPS', label: 'Trips', num: true, render: (r) => number(r.TRIPS) },
              { key: 'REVENUE', label: 'Revenue', num: true, render: (r) => money(r.REVENUE) },
            ]}
          />
        </div>
      </div>
    </Page>
  );
}
