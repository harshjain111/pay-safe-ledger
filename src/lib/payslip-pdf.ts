// ============================================================================
// PHASE 5 (Attendo rebuild) — the payslip, in Konnect 2's exact format.
//
// A4 portrait, serif (Times) throughout, black on white. Deliberately REMOVED
// per the client: the QR verification block, the GSTIN/EPF/ESI header line,
// the "Employer Contribution" footer note, and the "PAYSLIP" / "Pay Period"
// titles. Numbers print with two decimals, no currency symbol and no
// thousands separators (13500.00, not Rs 13,500.00).
//
// One generator, two surfaces: /my-payslips (employee, own finalized months
// only) and /payroll/salary-slips (HR/Admin, any employee, bulk download).
// ============================================================================

import type jsPDF from 'jspdf';
import { format, getDaysInMonth, parseISO } from 'date-fns';
import { numberToWordsIndian } from './number-to-words';
import { computePaidDays, honorificFor } from './payslip-format';

export interface PayslipStaff {
  full_name: string;
  employee_id: string;
  designation?: string | null;
  department?: string | null;
  date_of_joining?: string | null;
  gender?: string | null;
  is_active?: boolean | null;
  basic_salary?: number | null;
  hra?: number | null;
  other_allowances?: number | null;
  bank_account_number?: string | null;
  bank_name?: string | null;
  bank_ifsc?: string | null;
  pan_number?: string | null;
  uan_number?: string | null;
  esic_number?: string | null;
}

/** Employer details printed at the top of the payslip. All optional. */
export interface PayslipOrg {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  brand_code?: string | null;
  gstin?: string | null;
  epf_number?: string | null;
  esi_number?: string | null;
}

export interface PayslipSettlement {
  settlement_month: string; // YYYY-MM
  base_salary: number;
  earnings_basic: number;
  earnings_hra: number;
  earnings_allowances: number;
  incentives: number;
  bonus: number;
  overtime_amount: number;
  leave_days: number | null;
  leave_deduction: number;
  absent_deduction_days?: number | null;
  absent_deduction?: number | null;
  present_days?: number | null;
  half_days?: number | null;
  paid_leave_days?: number | null;
  off_days?: number | null;
  comp_off_earned?: number | null;
  discipline_fine: number;
  pf_employee: number;
  pf_employer: number;
  esi_employee: number;
  esi_employer: number;
  pt_amount: number;
  loan_emi_total: number;
  advances_adjusted: number;
  arrears?: number | null;
  net_salary: number;
  balance_payable: number;
  settled_at?: string | null;
  paid_at?: string | null;
  payment_mode?: string | null;
}

/** Leave balances etc. the payslip prints; all optional (0.00 when absent). */
export interface PayslipExtras {
  balSL?: number;
  balCL?: number;
  balPL?: number;
}

const n2 = (v: number | null | undefined) => (Number(v) || 0).toFixed(2);

async function drawPayslip(
  doc: jsPDF,
  staff: PayslipStaff,
  s: PayslipSettlement,
  org?: PayslipOrg,
  extras?: PayslipExtras,
) {
  const { default: autoTable } = await import('jspdf-autotable');
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = pageWidth - 14;
  const monthDate = parseISO(s.settlement_month + '-01');

  const dashedRule = (y: number) => {
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.setLineWidth(0.3);
    doc.line(left, y, right, y);
    doc.setLineDashPattern([], 0);
  };

  // ---- header ----------------------------------------------------------------
  let y = 16;
  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.text(org?.name || 'Konnect 2 Hospitality Pvt. Ltd.', pageWidth / 2, y, { align: 'center' });
  y += 6.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  const addressLine = [org?.address, org?.city && org?.pincode ? `${org.city} - ${org.pincode}` : org?.city || org?.pincode]
    .filter(Boolean).join(', ');
  if (addressLine) {
    doc.text(addressLine, pageWidth / 2, y, { align: 'center', maxWidth: pageWidth - 30 });
    y += 6;
  }
  dashedRule(y);
  y += 6.5;
  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text(`Salary Slip for Month Of ${format(monthDate, 'MMMM').toUpperCase()} ${format(monthDate, 'yyyy')}`, pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  dashedRule(y);
  y += 6;

  // ---- two-column identity block --------------------------------------------
  const joinDate = staff.date_of_joining
    ? `${format(parseISO(staff.date_of_joining), 'dd')}/${format(parseISO(staff.date_of_joining), 'MMMM').toUpperCase()}/${format(parseISO(staff.date_of_joining), 'yyyy')}`
    : '-';
  const paidDays = computePaidDays({
    daysInMonth: getDaysInMonth(monthDate),
    presentDays: Number(s.present_days ?? 0),
    halfDays: Number(s.half_days ?? 0),
    paidLeaveDays: Number(s.paid_leave_days ?? 0),
    offDays: Number(s.off_days ?? 0),
  });

  const leftCol: [string, string][] = [
    ['Employee Code', staff.employee_id],
    ['Brand', org?.brand_code || '-'],
    ['City', org?.city || '-'],
    ['Department', staff.department || '-'],
    ['Designation', staff.designation || '-'],
    ['Company Join Date', joinDate],
  ];
  const rightCol: [string, string][] = [
    ['Employee Name', `${honorificFor(staff.gender)}${staff.full_name}`],
    ['EMPLOYEE STATUS', staff.is_active === false ? 'Inactive' : 'Active'],
    ['UAN', staff.uan_number || '-'],
    ['PAN NO.', staff.pan_number || '-'],
    ['ESIC NO.', staff.esic_number || '-'],
    ['LWP DAYS', n2(s.leave_days)],
    ['PRESENT DAYS', `${Number(s.present_days ?? 0)} DAYS`],
    ['PAID DAYS', `${paidDays % 1 === 0 ? paidDays : paidDays.toFixed(1)} DAYS`],
    ['W.Off/Pd.C', `${n2(s.off_days)}/${n2(s.comp_off_earned)}`],
    ['Bal. SL/CL', `${n2(extras?.balSL)}/${n2(extras?.balCL)}`],
    ['Bal. PL', n2(extras?.balPL)],
  ];

  doc.setFontSize(9.5);
  const colGap = (right - left) / 2;
  const identityLine = (x: number, ly: number, label: string, value: string) => {
    doc.setFont('times', 'normal');
    doc.text(label, x, ly);
    doc.text(':', x + 36, ly);
    doc.setFont('times', 'bold');
    doc.text(value, x + 39, ly, { maxWidth: colGap - 44 });
  };
  const lineH = 5.2;
  const rows = Math.max(leftCol.length, rightCol.length);
  for (let i = 0; i < rows; i++) {
    const ly = y + i * lineH;
    if (leftCol[i]) identityLine(left, ly, leftCol[i][0], leftCol[i][1]);
    if (rightCol[i]) identityLine(left + colGap + 4, ly, rightCol[i][0], rightCol[i][1]);
  }
  y += rows * lineH + 3;

  // ---- earnings table --------------------------------------------------------
  // Columns (client-confirmed): Normal = full-month entitlement (staff
  // structure); Salary = what attendance earned this month (settlement
  // earnings); Supplementary = off-cycle additions; Total = Salary + Suppl.
  type Row5 = [string, number, number, number, number];
  const hasStructure = (Number(s.earnings_basic) + Number(s.earnings_hra) + Number(s.earnings_allowances)) > 0;
  const earnRows: Row5[] = [];
  if (hasStructure) {
    earnRows.push(['Basic', Number(staff.basic_salary ?? 0), Number(s.earnings_basic), 0, Number(s.earnings_basic)]);
    earnRows.push(['HRA', Number(staff.hra ?? 0), Number(s.earnings_hra), 0, Number(s.earnings_hra)]);
    earnRows.push(['Other allowance', Number(staff.other_allowances ?? 0), Number(s.earnings_allowances), 0, Number(s.earnings_allowances)]);
  } else {
    // No salary structure — fall back to one earned-salary row.
    earnRows.push(['Earned Salary', Number(staff.basic_salary ?? 0) || Number(s.base_salary), Number(s.base_salary), 0, Number(s.base_salary)]);
  }
  const suppl: [string, number][] = [
    ['Arrears', Math.max(0, Number(s.arrears ?? 0))],
    ['Incentives', Number(s.incentives ?? 0)],
    ['Bonus', Number(s.bonus ?? 0)],
    ['Overtime', Number(s.overtime_amount ?? 0)],
  ];
  for (const [label, v] of suppl) {
    if (v > 0.004) earnRows.push([label, 0, 0, v, v]);
  }
  const earnTotals = earnRows.reduce(
    (acc, r) => [acc[0] + r[1], acc[1] + r[2], acc[2] + r[3], acc[3] + r[4]],
    [0, 0, 0, 0],
  );

  const tableStyles = {
    theme: 'grid' as const,
    styles: { font: 'times', fontSize: 9, cellPadding: 1.6, textColor: [0, 0, 0] as [number, number, number], lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.2 },
    headStyles: { font: 'times', fontStyle: 'bold' as const, fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number] },
    columnStyles: {
      1: { halign: 'right' as const },
      2: { halign: 'right' as const },
      3: { halign: 'right' as const },
      4: { halign: 'right' as const },
    },
  };

  autoTable(doc, {
    startY: y,
    head: [['Earnings', 'Normal', 'Salary', 'Supplementary', 'Total']],
    body: earnRows.map((r) => [r[0], n2(r[1]), n2(r[2]), n2(r[3]), n2(r[4])]),
    foot: [[
      { content: 'Grand Total', styles: { fontStyle: 'bold' as const } },
      { content: n2(earnTotals[0]), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      { content: n2(earnTotals[1]), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      { content: n2(earnTotals[2]), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      { content: n2(earnTotals[3]), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
    ]],
    footStyles: { font: 'times', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
    ...tableStyles,
  });
  // @ts-expect-error lastAutoTable is appended by the autotable plugin
  y = (doc.lastAutoTable?.finalY ?? y + 30) + 4;

  // ---- deductions table (itemised, non-zero lines only) ----------------------
  const dedRows: Row5[] = [];
  const ded = (label: string, v: number) => { if (v > 0.004) dedRows.push([label, 0, v, 0, v]); };
  ded('Professional Tax', Number(s.pt_amount ?? 0));
  ded('PF Employee', Number(s.pf_employee ?? 0));
  ded('ESI Employee', Number(s.esi_employee ?? 0));
  ded(`Leave Deduction (${Number(s.leave_days ?? 0)} d)`, Number(s.leave_deduction ?? 0));
  ded(`Absent Days (${Number(s.absent_deduction_days ?? 0)} d)`, Number(s.absent_deduction ?? 0));
  ded('Discipline Fine', Number(s.discipline_fine ?? 0));
  ded('Loan EMI', Number(s.loan_emi_total ?? 0));
  ded('Advance Adjustment', Number(s.advances_adjusted ?? 0));
  ded('Arrears Recovery', Math.max(0, -Number(s.arrears ?? 0)));
  const dedTotal = dedRows.reduce((sum, r) => sum + r[4], 0);

  autoTable(doc, {
    startY: y,
    head: [['Deductions', 'Normal', 'Salary', 'Supplementary', 'Total']],
    body: dedRows.length
      ? dedRows.map((r) => [r[0], n2(r[1]), n2(r[2]), n2(r[3]), n2(r[4])])
      : [['—', n2(0), n2(0), n2(0), n2(0)]],
    foot: [[
      { content: 'Grand Total', styles: { fontStyle: 'bold' as const } },
      { content: n2(0), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      { content: n2(dedTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      { content: n2(0), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
      { content: n2(dedTotal), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
    ]],
    footStyles: { font: 'times', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
    ...tableStyles,
  });
  // @ts-expect-error lastAutoTable
  y = (doc.lastAutoTable?.finalY ?? y + 30) + 7;

  // ---- right-aligned summary block -------------------------------------------
  doc.setFontSize(10);
  const summary: [string, string][] = [
    ['Gross Earnings', n2(earnTotals[3])],
    ['Gross Deduction', n2(dedTotal)],
    ['Net Payable', n2(s.balance_payable)],
  ];
  for (const [label, value] of summary) {
    doc.setFont('times', 'normal');
    doc.text(label, right - 55, y);
    doc.text(':', right - 27, y);
    doc.setFont('times', 'bold');
    doc.text(value, right, y, { align: 'right' });
    y += 5.2;
  }
  y += 1;
  dashedRule(y);
  y += 6;

  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(`Net Payable (In Words) : ${numberToWordsIndian(Number(s.balance_payable) || 0)} ONLY`, left, y, { maxWidth: right - left });
  y += 8;

  doc.setFont('times', 'italic');
  doc.setFontSize(10.5);
  doc.text(
    'Note : Private and Confidential. This is computer generated slip hence signature is not required.',
    left,
    y,
    { maxWidth: right - left },
  );
}

export async function downloadPayslipPDF(
  staff: PayslipStaff,
  settlement: PayslipSettlement,
  org?: PayslipOrg,
  extras?: PayslipExtras,
) {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF('p', 'mm', 'a4');
  await drawPayslip(doc, staff, settlement, org, extras);
  doc.save(`payslip_${staff.employee_id}_${settlement.settlement_month}.pdf`);
}

export async function downloadBulkPayslipsPDF(
  month: string,
  items: Array<{ staff: PayslipStaff; settlement: PayslipSettlement; extras?: PayslipExtras }>,
  org?: PayslipOrg,
) {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF('p', 'mm', 'a4');
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (idx > 0) doc.addPage();
    await drawPayslip(doc, item.staff, item.settlement, org, item.extras);
  }
  doc.save(`payslips_${month}.pdf`);
}
