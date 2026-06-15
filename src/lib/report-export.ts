// Shared Excel + PDF export for the attendance reports. Reuses the exact
// approach the Attendance page already uses: `xlsx` (aoa_to_sheet/writeFile)
// for Excel and the shared `exportToPDF`/`downloadPDF` (jsPDF + autotable) for
// PDF — so a report's export matches its on-screen columns.

import { exportToPDF, downloadPDF } from './pdf-export';

export interface ReportSheet {
  name: string;
  headers: (string | number)[];
  rows: (string | number)[][];
}

/** Build a multi-sheet .xlsx workbook and trigger the download. */
export async function exportSheetsToExcel(filename: string, sheets: ReportSheet[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    // Excel caps sheet names at 31 chars and disallows a few characters.
    const safe = sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1';
    XLSX.utils.book_append_sheet(wb, ws, safe);
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Render a single table to a branded PDF and trigger the download. */
export async function exportTableToPDF(opts: {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  dateRange?: { from: Date; to: Date };
  totals?: (string | number)[];
}): Promise<void> {
  const doc = await exportToPDF({
    title: opts.title,
    subtitle: opts.subtitle,
    headers: opts.headers,
    data: opts.rows,
    dateRange: opts.dateRange,
    totals: opts.totals,
  });
  downloadPDF(doc, opts.filename);
}
