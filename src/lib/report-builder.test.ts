import { describe, it, expect } from 'vitest';
import {
  computeReport, sortRows, formatDisplay, toExportValue, buildExportMatrix,
  getSource, REPORT_SOURCES, type ReportDefinition, type ReportRow,
} from './report-builder';

const rows: ReportRow[] = [
  { entry_date: '2026-06-01', staff_name: 'Asha', department: 'Kitchen', voucher_type: 'payment', debit: 100, tag: 'advance' },
  { entry_date: '2026-06-02', staff_name: 'Asha', department: 'Kitchen', voucher_type: 'payment', debit: 50, tag: 'advance' },
  { entry_date: '2026-06-03', staff_name: 'Ben', department: 'Service', voucher_type: 'journal', debit: 200, tag: 'salary' },
];

const baseDef = (over: Partial<ReportDefinition> = {}): ReportDefinition => ({
  source: 'ledger',
  columns: ['entry_date', 'staff_name', 'voucher_type', 'debit'],
  filters: { from: '2026-06-01', to: '2026-06-30' },
  ...over,
});

describe('report sources catalog', () => {
  it('maps each source to a data permission (C.6 enforcement)', () => {
    expect(getSource('attendance').permission).toBe('attendance.view');
    expect(getSource('salary').permission).toBe('salaries.view');
    expect(getSource('ledger').permission).toBe('ledger.view');
    expect(REPORT_SOURCES).toHaveLength(3);
  });
});

describe('computeReport — projection (no grouping)', () => {
  it('keeps only the selected columns, in order, one row per input row', () => {
    const r = computeReport(rows, baseDef());
    expect(r.columns.map((c) => c.key)).toEqual(['entry_date', 'staff_name', 'voucher_type', 'debit']);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({ entry_date: '2026-06-01', staff_name: 'Asha', voucher_type: 'payment', debit: 100 });
  });
});

describe('computeReport — grouping', () => {
  it('sums numeric/money columns, blanks text, and appends a Count column', () => {
    const r = computeReport(rows, baseDef({ groupBy: 'staff_name', columns: ['staff_name', 'voucher_type', 'debit'] }));
    // group key column + count appended
    expect(r.columns.map((c) => c.key)).toEqual(['staff_name', 'voucher_type', 'debit', '__count']);
    const asha = r.rows.find((x) => x.staff_name === 'Asha')!;
    expect(asha.debit).toBe(150);           // 100 + 50
    expect(asha.voucher_type).toBeNull();   // text blanked in aggregate
    expect(asha.__count).toBe(2);
    const ben = r.rows.find((x) => x.staff_name === 'Ben')!;
    expect(ben.debit).toBe(200);
    expect(ben.__count).toBe(1);
  });
});

describe('computeReport — sorting', () => {
  it('sorts numeric descending', () => {
    const r = computeReport(rows, baseDef({ sort: { field: 'debit', dir: 'desc' } }));
    expect(r.rows.map((x) => x.debit)).toEqual([200, 100, 50]);
  });
  it('nulls sort last', () => {
    const withNull: ReportRow[] = [{ debit: 5 }, { debit: null }, { debit: 9 }];
    expect(sortRows(withNull, { field: 'debit', dir: 'asc' }).map((x) => x.debit)).toEqual([5, 9, null]);
  });
});

describe('value formatting + export matrix', () => {
  it('formats money and numbers for display, — for empty', () => {
    expect(formatDisplay(1234.5, 'money')).toBe('₹1,234.5');
    expect(formatDisplay(null, 'text')).toBe('—');
    expect(formatDisplay('payment', 'text')).toBe('payment');
  });
  it('keeps numbers numeric for export', () => {
    expect(toExportValue(1234.5, 'money')).toBe(1234.5);
    expect(toExportValue(null, 'money')).toBe('');
    expect(toExportValue('payment', 'text')).toBe('payment');
  });
  it('builds a headers + rows matrix aligned to columns', () => {
    const report = computeReport(rows, baseDef({ columns: ['staff_name', 'debit'] }));
    const m = buildExportMatrix(report);
    expect(m.headers).toEqual(['Staff', 'Debit']);
    expect(m.rows[0]).toEqual(['Asha', 100]);
  });
});
