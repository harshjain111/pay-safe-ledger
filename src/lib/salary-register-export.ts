import type { SalaryRegister } from './salary-register';
import { monthHeading } from './salary-register';

// ---------------------------------------------------------------------------
// Writes the salary register as the accountant's own file.
//
// exportSheetsToExcel takes one header row and some data rows, which is right
// for the report-builder exports but not for this: the register has a
// three-line company block, a two-row header where ATTENDANCE spans four
// columns, and a totals row at the foot. So this builds the sheet cell by cell
// and applies the merges, rather than bending the generic helper into a shape
// it was not meant for.
// ---------------------------------------------------------------------------

const HEADERS = [
  'SL NO', 'EMPLOYEE NAME', 'OUTLET', 'DEP.',
  'ATTENDANCE', '', '', '',
  'ACTUAL SALARY', 'GROSS SALARY', 'BASIC', 'HRA', 'OTHER ALLOWANCE',
  "PF - EMPLOYEE'S CONTRIBUTION @12%",
  "ESI - EMPLOYEE'S CONTRIBUTION @.75%",
  'P.TAX', 'TDS', 'ADVANCE', 'TOTAL DED.', 'NET SALARY',
  "PF - EMPLOYER'S CONTRIBUTION @12%",
  "ESI - EMPLOYER'S CONTRIBUTION @3.25%",
  'TOTAL CONTRIBUTION BY EMPLOYER',
];

const SUB_HEADERS = [
  '', '', '', '',
  'TOTAL NO OF WORKING DAYS', 'PRESENT', 'ABSENT', 'REMAINING LEAVES',
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
];

/** Column widths, in characters — names and the statutory headings need room. */
const WIDTHS = [
  6, 26, 22, 18, 12, 10, 10, 12, 13, 13, 11, 10, 15,
  16, 16, 9, 9, 11, 12, 13, 16, 16, 18,
];

export async function downloadSalaryRegister(
  register: SalaryRegister,
  organisation: { name?: string | null; address?: string | null },
): Promise<void> {
  const XLSX = await import('xlsx');

  const blank = () => Array<string | number>(HEADERS.length).fill('');
  const titleRow = (text: string) => {
    const r = blank();
    r[0] = text;
    return r;
  };

  const aoa: (string | number)[][] = [
    titleRow(organisation.name || 'Salary Register'),
    titleRow(organisation.address || ''),
    titleRow(`SALARY FOR THE MONTH OF ${monthHeading(register.month)}`),
    HEADERS,
    SUB_HEADERS,
  ];

  for (const r of register.rows) {
    aoa.push([
      r.slNo, r.name, r.outlet, r.designation,
      r.workingDays, r.present, r.absent,
      r.remainingLeaves ?? '',
      r.actualSalary, r.gross, r.basic, r.hra, r.otherAllowance,
      r.pfEmployee, r.esiEmployee, r.pTax, r.tds, r.advance,
      r.totalDeductions, r.net, r.pfEmployer, r.esiEmployer,
      r.totalEmployerContribution,
    ]);
  }

  const t = register.totals;
  aoa.push([
    '', 'TOTAL', '', '', '', '', '', '',
    t.actualSalary, t.gross, t.basic, t.hra, t.otherAllowance,
    t.pfEmployee, t.esiEmployee, t.pTax, t.tds, t.advance,
    t.totalDeductions, t.net, t.pfEmployer, t.esiEmployer,
    t.totalEmployerContribution,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const last = HEADERS.length - 1;

  ws['!merges'] = [
    // The three title lines run the width of the sheet.
    { s: { r: 0, c: 0 }, e: { r: 0, c: last } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: last } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: last } },
    // ATTENDANCE spans its four sub-columns; every other header spans the two
    // header rows, which is what puts the sub-labels only under ATTENDANCE.
    { s: { r: 3, c: 4 }, e: { r: 3, c: 7 } },
    ...[0, 1, 2, 3].map((c) => ({ s: { r: 3, c }, e: { r: 4, c } })),
    ...Array.from({ length: last - 7 }, (_, i) => i + 8)
      .map((c) => ({ s: { r: 3, c }, e: { r: 4, c } })),
  ];

  ws['!cols'] = WIDTHS.map((w) => ({ wch: w }));
  // Freeze everything above and to the left of the first data cell, so the
  // names and the header stay put while you scan 23 columns of figures.
  ws['!freeze'] = { xSplit: 2, ySplit: 5 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, monthHeading(register.month).replace(/'/g, ' '));
  XLSX.writeFile(wb, `Salary Register ${register.month}.xlsx`);
}
