// Generic table export (CSV + Excel) used by the shared <ExportButton />.
// Excel reuses the existing xlsx helper; CSV is built here with proper escaping
// and a UTF-8 BOM so Excel opens Indian-language / ₹ content correctly.

import { exportSheetsToExcel } from './report-export';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export type ExportFormat = 'csv' | 'xlsx';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportRows<T>(opts: {
  filename: string;
  sheetName?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  format: ExportFormat;
}): Promise<void> {
  const { filename, columns, rows, format } = opts;
  const headers = columns.map((c) => c.header);
  const data: (string | number)[][] = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r);
      return v == null ? '' : (typeof v === 'number' ? v : String(v));
    }),
  );

  if (format === 'xlsx') {
    await exportSheetsToExcel(filename, [{ name: opts.sheetName ?? 'Sheet1', headers, rows: data }]);
    return;
  }

  const lines = [headers, ...data].map((row) => row.map(csvCell).join(','));
  const csv = '﻿' + lines.join('\r\n'); // BOM → Excel reads UTF-8
  downloadBlob(csv, 'text/csv;charset=utf-8', filename.endsWith('.csv') ? filename : `${filename}.csv`);
}
