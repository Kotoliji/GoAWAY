const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export const money = (v: unknown) => (v == null ? '—' : eur.format(Number(v)));
export const number = (v: unknown) => (v == null ? '—' : num.format(Number(v)));

export function dateTime(v: unknown): string {
  if (v == null) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function date(v: unknown): string {
  if (v == null) return '—';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

/** Any cell from an Oracle row: ISO dates become readable, numbers grouped. */
export function cell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return number(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    return v.endsWith('T00:00:00.000Z') ? date(v) : dateTime(v);
  }
  return String(v);
}

/** ORACLE_COLUMN_NAME -> "Oracle column name". */
export const columnLabel = (c: string) => {
  const s = c.toLowerCase().replace(/_+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
