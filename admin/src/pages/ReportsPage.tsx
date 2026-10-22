import { useState } from 'react';
import { get } from '../api';
import { DataTable, Page, useLoad } from '../components/ui';
import { cell, columnLabel } from '../format';

interface ReportMeta {
  key: string;
  title: string;
  description: string;
}

interface Report extends ReportMeta {
  view: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

/** The analytical SQL views (database/03_views), browsable as tables. */
export default function ReportsPage() {
  const list = useLoad(() => get<{ reports: ReportMeta[] }>('/admin/reports'));
  const [key, setKey] = useState<string | null>(null);
  const current = key ?? list.data?.reports[0]?.key ?? null;
  const report = useLoad(
    () => (current ? get<Report>(`/admin/reports/${current}`) : Promise.resolve(null)),
    [current],
  );
  const r = report.data;

  return (
    <Page title="Reports" subtitle="Analytical views computed in Oracle (SQL views over the live data).">
      <div className="reports-layout">
        <div className="card" style={{ padding: 8 }}>
          {list.error && <div className="error">{list.error}</div>}
          {list.data?.reports.map((m) => (
            <button key={m.key} className={`report-link ${m.key === current ? 'active' : ''}`} onClick={() => setKey(m.key)}>
              <strong>{m.title}</strong>
              <span>{m.description}</span>
            </button>
          ))}
        </div>
        <div className="card">
          {r ? (
            <>
              <h2>{r.title}</h2>
              <p className="sub">{r.description} · <code>{r.view}</code> · {r.rows.length} rows</p>
              <DataTable
                rowKey={(row) => JSON.stringify(row)}
                rows={r.rows}
                empty="No rows for the current data (this view looks at a recent time window)."
                columns={r.columns.map((c) => ({
                  key: c,
                  label: columnLabel(c),
                  num: r.rows.some((row) => typeof row[c] === 'number'),
                  render: (row: Record<string, unknown>) => cell(row[c]),
                }))}
              />
            </>
          ) : (
            <p className="note">{report.error ?? 'Loading…'}</p>
          )}
        </div>
      </div>
    </Page>
  );
}
