import { ReactNode, useCallback, useEffect, useState } from 'react';

export function Page({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'good',
  AVAILABLE: 'good',
  ASSIGNED: 'wait',
  REQUESTED: 'wait',
  ACCEPTED: 'live',
  PICKED_UP: 'live',
  ON_TRIP: 'live',
  CANCELLED: 'bad',
  DISABLED: 'bad',
};

/** Status as dot + text (the label carries the meaning, not the colour). */
export function Status({ value }: { value: string }) {
  return <span className={`badge ${STATUS_CLASS[value] ?? ''}`}>{value.replace('_', ' ').toLowerCase()}</span>;
}

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  render?: (row: T) => ReactNode;
}

export function DataTable<T extends Record<string, any>>({ columns, rows, empty = 'Nothing here yet.', rowKey }: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  rowKey: (row: T) => string | number;
}) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : String(r[c.key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Load data on mount (and on demand); keeps the last good data on error. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}
