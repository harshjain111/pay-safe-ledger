import type jsPDF from 'jspdf';
import { format } from 'date-fns';
import { qrPngDataUrl, docFingerprint } from './qr';

export interface PayslipStaff {
  full_name: string;
  employee_id: string;
  designation?: string | null;
  department?: string | null;
  date_of_joining?: string | null;
  bank_account_number?: string | null;
  bank_name?: string | null;
  bank_ifsc?: string | null;
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

const inr = (n: number) =>
  `Rs. ${(Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

async function drawPayslip(doc: jsPDF, staff: PayslipStaff, s: PayslipSettlement, startY = 14) {
  const { default: autoTable } = await import('jspdf-autotable');
  const pageWidth = doc.internal.pageSize.getWidth();
  const monthLabel = format(new Date(s.settlement_month + '-01'), 'MMMM yyyy');

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYSLIP', pageWidth / 2, startY, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Konnect 2 Hospitality', pageWidth / 2, startY + 6, { align: 'center' });
  // (Employer name — kept on payslip; product footer below)
  doc.setFontSize(9);
  doc.text(`Pay Period: ${monthLabel}`, pageWidth / 2, startY + 11, { align: 'center' });

  // Verification QR (top-right) — encodes the payslip's canonical fields so a
  // scan can be cross-checked against the printed figures. (QR stamp)
  const payDate = s.paid_at
    ? format(new Date(s.paid_at), 'dd MMM yyyy')
    : s.settled_at
      ? format(new Date(s.settled_at), 'dd MMM yyyy')
      : '-';
  const ref = docFingerprint(
    `payslip|${staff.employee_id}|${s.settlement_month}|${s.net_salary}|${s.balance_payable}`,
  );
  const qr = await qrPngDataUrl(
    [
      'VIBRND HR BUDDY - Payslip verification',
      'Konnect 2 Hospitality',
      `Emp: ${staff.full_name} (${staff.employee_id})`,
      `Period: ${monthLabel}`,
      `Net Payable: ${inr(s.balance_payable)}`,
      `Paid: ${payDate}`,
      `Ref: ${ref}`,
    ].join('\n'),
  );
  const qrSize = 18;
  const qrX = pageWidth - 14 - qrSize;
  const qrY = startY - 6;
  doc.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Scan to verify · ${ref}`, qrX + qrSize / 2, qrY + qrSize + 2.5, { align: 'center' });

  // Staff details box
  const detailsY = startY + 18;
  autoTable(doc, {
    startY: detailsY,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ['Employee Name', staff.full_name, 'Employee ID', staff.employee_id],
      ['Designation', staff.designation || '-', 'Department', staff.department || '-'],
      [
        'Date of Joining',
        staff.date_of_joining ? format(new Date(staff.date_of_joining), 'dd MMM yyyy') : '-',
        'Pay Date',
        s.paid_at ? format(new Date(s.paid_at), 'dd MMM yyyy') : (s.settled_at ? format(new Date(s.settled_at), 'dd MMM yyyy') : '-'),
      ],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35 },
      1: { cellWidth: 55 },
      2: { fontStyle: 'bold', cellWidth: 30 },
      3: { cellWidth: 55 },
    },
  });

  // Earnings / Deductions table
  const earnings: Array<[string, number]> = [];
  const hasStructure = (s.earnings_basic + s.earnings_hra + s.earnings_allowances) > 0;
  if (hasStructure) {
    earnings.push(['Basic', s.earnings_basic]);
    if (s.earnings_hra > 0) earnings.push(['HRA', s.earnings_hra]);
    if (s.earnings_allowances > 0) earnings.push(['Other Allowances', s.earnings_allowances]);
  } else {
    earnings.push(['Earned Salary', s.base_salary]);
  }
  if (s.incentives > 0) earnings.push(['Incentives', s.incentives]);
  if (s.bonus > 0) earnings.push(['Bonus', s.bonus]);
  if (s.overtime_amount > 0) earnings.push(['Overtime', s.overtime_amount]);
  if ((s.arrears ?? 0) > 0) earnings.push(['Arrears (Back-pay)', s.arrears as number]);
  const totalEarnings = earnings.reduce((sum, [, v]) => sum + v, 0);

  const deductions: Array<[string, number]> = [];
  if (s.leave_deduction > 0) deductions.push([`Leave Deduction (${s.leave_days ?? 0} d)`, s.leave_deduction]);
  if ((s.absent_deduction ?? 0) > 0) deductions.push([`Absent Days (${s.absent_deduction_days ?? 0} d)`, s.absent_deduction as number]);
  if (s.discipline_fine > 0) deductions.push(['Late/Discipline Fine', s.discipline_fine]);
  if (s.pf_employee > 0) deductions.push(['PF (Employee)', s.pf_employee]);
  if (s.esi_employee > 0) deductions.push(['ESI (Employee)', s.esi_employee]);
  if (s.pt_amount > 0) deductions.push(['Professional Tax', s.pt_amount]);
  if (s.loan_emi_total > 0) deductions.push(['Loan EMI', s.loan_emi_total]);
  if (s.advances_adjusted > 0) deductions.push(['Advance Adjustment', s.advances_adjusted]);
  if ((s.arrears ?? 0) < 0) deductions.push(['Arrears (Recovery)', Math.abs(s.arrears as number)]);
  const totalDeductions = deductions.reduce((sum, [, v]) => sum + v, 0);

  const rows = Math.max(earnings.length, deductions.length);
  const body: string[][] = [];
  for (let i = 0; i < rows; i++) {
    body.push([
      earnings[i]?.[0] ?? '',
      earnings[i] ? inr(earnings[i][1]) : '',
      deductions[i]?.[0] ?? '',
      deductions[i] ? inr(deductions[i][1]) : '',
    ]);
  }

  // @ts-expect-error lastAutoTable is appended by autotable plugin
  const afterDetailsY = doc.lastAutoTable?.finalY ?? detailsY + 30;

  autoTable(doc, {
    startY: afterDetailsY + 4,
    head: [['Earnings', 'Amount', 'Deductions', 'Amount']],
    body,
    foot: [[
      { content: 'Total Earnings', styles: { fontStyle: 'bold' } },
      { content: inr(totalEarnings), styles: { fontStyle: 'bold' } },
      { content: 'Total Deductions', styles: { fontStyle: 'bold' } },
      { content: inr(totalDeductions), styles: { fontStyle: 'bold' } },
    ]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontSize: 9 },
    footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0] },
    columnStyles: {
      1: { halign: 'right' },
      3: { halign: 'right' },
    },
  });

  // @ts-expect-error lastAutoTable
  const afterDedY = doc.lastAutoTable?.finalY ?? afterDetailsY + 40;

  // Net pay box
  autoTable(doc, {
    startY: afterDedY + 4,
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: 3, fontStyle: 'bold' },
    body: [['NET PAYABLE', inr(s.balance_payable)]],
    columnStyles: {
      0: { fillColor: [41, 128, 185], textColor: [255, 255, 255] },
      1: { halign: 'right', fillColor: [240, 248, 255] },
    },
  });

  // Employer cost note (only if PF/ESI employer > 0)
  if (s.pf_employer > 0 || s.esi_employer > 0) {
    // @ts-expect-error lastAutoTable
    const y = doc.lastAutoTable?.finalY ?? afterDedY + 15;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    const parts: string[] = [];
    if (s.pf_employer > 0) parts.push(`PF (Employer): ${inr(s.pf_employer)}`);
    if (s.esi_employer > 0) parts.push(`ESI (Employer): ${inr(s.esi_employer)}`);
    doc.text(`Employer Contribution — ${parts.join(' | ')}`, 14, y + 5);
  }
}

export async function downloadPayslipPDF(staff: PayslipStaff, settlement: PayslipSettlement) {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF('p', 'mm', 'a4');
  await drawPayslip(doc, staff, settlement);

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'This is a system-generated payslip and does not require a signature.',
    doc.internal.pageSize.getWidth() / 2,
    pageHeight - 8,
    { align: 'center' },
  );

  doc.save(`payslip_${staff.employee_id}_${settlement.settlement_month}.pdf`);
}

export async function downloadBulkPayslipsPDF(
  month: string,
  items: Array<{ staff: PayslipStaff; settlement: PayslipSettlement }>,
) {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF('p', 'mm', 'a4');
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (idx > 0) doc.addPage();
    await drawPayslip(doc, item.staff, item.settlement);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'System-generated payslip — Powered by VIBRND HR BUDDY',
      doc.internal.pageSize.getWidth() / 2,
      pageHeight - 8,
      { align: 'center' },
    );
  }
  doc.save(`payslips_${month}.pdf`);
}
