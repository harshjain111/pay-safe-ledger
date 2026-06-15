import { describe, it, expect } from 'vitest';
import {
  computeReport, sortRows, formatDisplay, toExportValue, buildExportMatrix,
  getSource, REPORT_SOURCES, type ReportDefinition, type ReportRow,
} from './report-builder';

const rows: ReportRow[] = [
  { expense_date: '2026-06-01', staff_name: 'Asha', department: 'Kitchen', category: 'food', amount: 100, status: 'approved' },
  { expense_date: '2026-06-02', staff_name: 'Asha', department: 'Kitchen', category: 'food', amount: 50, status: 'approved' },
  { expense_date: '2026-06-03', staff_name: 'Ben', department: 'Service', category: 'travel', amount: 200, status: 'pending' },
];

const baseDef = (over: Partial<ReportDefinition> = {}): ReportDefinition => ({
  source: 'expenses',
  columns: ['expense_date', 'staff_name', 'category', 'amount'],
  filters: { from: '2026-06-01', to: '2026-06-30' },
  ...over,
});

describe('report sources catalog', () => {
  it('maps each source to a data permission (C.6 enforcement)', () => {
    expect(getSource('attendance').permission).toBe('attendance.view');
    expect(getSource('salary').permission).toBe('salaries.view');
    expect(getSource('expenses').permission).toBe('expenses.view');
    expect(getSource('ledger').permission).toBe('ledger.view');
    expect(REPORT_SOURCES).toHaveLength(4);
  });
});

describe('computeReport — projection (no grouping)', () => {
  it('keeps only the selected columns, in order, one row per input row', () => {
    const r = computeReport(rows, baseDef());
    expect(r.columns.map((c) => c.key)).toEqual(['expense_date', 'staff_name', 'category', 'amount']);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({ expense_date: '2026-06-01', staff_name: 'Asha', category: 'food', amount: 100 });
  });
});

describe('computeReport — grouping', () => {
  it('sums numeric/money columns, blanks text, and appends a Count column', () => {
    const r = computeReport(rows, baseDef({ groupBy: 'staff_name', columns: ['staff_name', 'category', 'amount'] }));
    // group key column + count appended
    expect(r.columns.map((c) => c.key)).toEqual(['staff_name', 'category', 'amount', '__count']);
    const asha = r.rows.find((x) => x.staff_name === 'Asha')!;
    expect(asha.amount).toBe(150);      // 100 + 50
    expect(asha.category).toBeNull();   // text blanked in aggregate
    expect(asha.__count).toBe(2);
    const ben = r.rows.find((x) => x.staff_name === 'Ben')!;
    expect(ben.amount).toBe(200);
    expect(ben.__count).toBe(1);
  });
});

describe('computeReport — sorting', () => {
  it('sorts numeric descending', () => {
    const r = computeReport(rows, baseDef({ sort: { field: 'amount', dir: 'desc' } }));
    expect(r.rows.map((x) => x.amount)).toEqual([200, 100, 50]);
  });
  it('nulls sort last', () => {
    const withNull: ReportRow[] = [{ amount: 5 }, { amount: null }, { amount: 9 }];
    expect(sortRows(withNull, { field: 'amount', dir: 'asc' }).map((x) => x.amount)).toEqual([5, 9, null]);
  });
});

describe('value formatting + export matrix', () => {
  it('formats money and numbers for display, — for empty', () => {
    expect(formatDisplay(1234.5, 'money')).toBe('₹1,234.5');
    expect(formatDisplay(null, 'text')).toBe('—');
    expect(formatDisplay('food', 'text')).toBe('food');
  });
  it('keeps numbers numeric for export', () => {
    expect(toExportValue(1234.5, 'money')).toBe(1234.5);
    expect(toExportValue(null, 'money')).toBe('');
    expect(toExportValue('food', 'text')).toBe('food');
  });
  it('builds a headers + rows matrix aligned to columns', () => {
    const report = computeReport(rows, baseDef({ columns: ['staff_name', 'amount'] }));
    const m = buildExportMatrix(report);
    expect(m.headers).toEqual(['Staff', 'Amount']);
    expect(m.rows[0]).toEqual(['Asha', 100]);
  });
});
