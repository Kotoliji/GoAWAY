import { FormEvent, useState } from 'react';
import { get, post } from '../api';
import { Column, DataTable, Kpi, Page, useLoad } from '../components/ui';
import { date, dateTime, money, number } from '../format';

interface Payment {
  PAYMENT_ID: number;
  DRIVER_ID: number;
  NAME: string;
  PERIOD_START: string;
  PERIOD_END: string;
  VALUE: number;
  COMMISSION: number;
  NET_VALUE: number;
  PAYMENT_DATE: string;
}

const COLUMNS: Column<Payment>[] = [
  { key: 'PAYMENT_ID', label: '#', render: (p) => <span className="dim">{p.PAYMENT_ID}</span> },
  { key: 'NAME', label: 'Driver', render: (p) => <span className="strong">{p.NAME}</span> },
  { key: 'period', label: 'Period', render: (p) => `${date(p.PERIOD_START)} – ${date(p.PERIOD_END)}` },
  { key: 'VALUE', label: 'Billed', num: true, render: (p) => money(p.VALUE) },
  { key: 'COMMISSION', label: 'Commission', num: true, render: (p) => money(p.COMMISSION) },
  { key: 'NET_VALUE', label: 'Paid out', num: true, render: (p) => <span className="strong">{money(p.NET_VALUE)}</span> },
  { key: 'PAYMENT_DATE', label: 'Paid on', render: (p) => dateTime(p.PAYMENT_DATE) },
];

export default function PayoutsPage() {
  const payments = useLoad(() => get<{ payments: Payment[] }>('/admin/payments'));
  const drivers = useLoad(() => get<{ drivers: { UNPAID: number }[] }>('/admin/drivers'));
  const [minAmount, setMinAmount] = useState('50');
  const [minDays, setMinDays] = useState('30');
  const [created, setCreated] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unpaid = (drivers.data?.drivers ?? []).reduce((s, d) => s + Number(d.UNPAID ?? 0), 0);
  const owed = (drivers.data?.drivers ?? []).filter((d) => Number(d.UNPAID) > 0).length;

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ created: Payment[] }>('/admin/payments/run', {
        minAmount: Number(minAmount),
        minDays: Number(minDays),
      });
      setCreated(r.created);
      await Promise.all([payments.reload(), drivers.reload()]);
    } catch (err: any) {
      setError(err?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Payouts" subtitle="Driver payments, net of the platform commission.">
      <div className="grid kpis">
        <Kpi label="Unpaid balance" value={money(unpaid)} hint={`${owed} drivers with completed trips not paid yet`} />
        <Kpi label="Payments made" value={number(payments.data?.payments.length ?? 0)} hint="latest 200 shown" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Run payouts</h2>
        <p className="sub">
          Runs <code>paga_aos_motoristas</code>: pays every driver whose unpaid amount exceeds the minimum, or who
          was last paid longer ago than the interval. Commission comes from the vehicle's tariff; payments under €2
          net are skipped.
        </p>
        <form className="form-row" onSubmit={run}>
          <div className="field">
            <label htmlFor="amt">Minimum amount (€)</label>
            <input id="amt" className="input" type="number" min="0" step="1" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="days">Days since last payment</label>
            <input id="days" className="input" type="number" min="0" step="1" value={minDays} onChange={(e) => setMinDays(e.target.value)} />
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Paying…' : 'Run payouts'}</button>
        </form>
        {error && <div className="error">{error}</div>}
        {created && (
          <div style={{ marginTop: 14 }}>
            <p className="ok">
              {created.length
                ? `${created.length} payments registered · ${money(created.reduce((s, p) => s + p.NET_VALUE, 0))} paid out`
                : 'Nobody was due a payment.'}
            </p>
            {created.length > 0 && <DataTable rowKey={(p) => p.PAYMENT_ID} rows={created} columns={COLUMNS} />}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Payment history</h2>
        {payments.error && <div className="error">{payments.error}</div>}
        <DataTable rowKey={(p) => p.PAYMENT_ID} rows={payments.data?.payments ?? []} columns={COLUMNS} empty={payments.data ? 'No payments yet.' : 'Loading…'} />
      </div>
    </Page>
  );
}
