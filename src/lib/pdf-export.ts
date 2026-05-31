import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface PDFExportOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  data: (string | number)[][];
  dateRange?: { from: Date; to: Date };
  totals?: (string | number)[];
}

export function exportToPDF(options: PDFExportOptions) {
  const { title, subtitle, headers, data, dateRange, totals } = options;
  
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Konnect 2 Hospitality', 14, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Internal Payroll System', 14, 26);
  
  // Report title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 40);
  
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, 14, 46);
  }
  
  // Date range
  if (dateRange) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Period: ${format(dateRange.from, 'dd MMM yyyy')} - ${format(dateRange.to, 'dd MMM yyyy')}`,
      14,
      subtitle ? 52 : 46
    );
  }
  
  // Generated date
  doc.setFontSize(9);
  doc.text(
    `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
    pageWidth - 14,
    20,
    { align: 'right' }
  );
  
  // Table
  const startY = dateRange ? (subtitle ? 58 : 52) : (subtitle ? 52 : 46);
  
  const tableData = [...data];
  if (totals) {
    tableData.push(totals);
  }
  
  autoTable(doc, {
    head: [headers],
    body: tableData,
    startY,
    theme: 'striped',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    footStyles: {
      fillColor: [220, 220, 220],
      fontStyle: 'bold',
    },
    didDrawPage: (data) => {
      // Footer with page numbers
      const pageCount = doc.getNumberOfPages();
      const currentPage = data.pageNumber;
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Page ${currentPage} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
      
      doc.text(
        'Konnect 2 Hospitality Payroll - Confidential',
        14,
        doc.internal.pageSize.getHeight() - 10
      );
    },
  });
  
  return doc;
}

export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(`${filename}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

// Pre-built report exporters
export function exportLedgerPDF(
  data: any[],
  staffName: string,
  dateRange: { from: Date; to: Date }
) {
  // Calculate opening and closing balance
  const openingBalance = 0; // Would need to be calculated from before dateRange.from
  let runningBalance = openingBalance;
  
  const tableData = data.map(entry => {
    runningBalance += (entry.credit || 0) - (entry.debit || 0);
    return [
      format(new Date(entry.entry_date), 'dd/MM/yyyy'),
      entry.voucher_no,
      entry.description?.substring(0, 40) || '',
      entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN')}` : '-',
      entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN')}` : '-',
      `₹${runningBalance.toLocaleString('en-IN')}`,
    ];
  });
  
  const totalDebit = data.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const totalCredit = data.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  
  const doc = exportToPDF({
    title: 'Staff Ledger Report',
    subtitle: staffName,
    headers: ['Date', 'Voucher', 'Description', 'Debit', 'Credit', 'Balance'],
    data: tableData,
    dateRange,
    totals: [
      'Total',
      '',
      '',
      `₹${totalDebit.toLocaleString('en-IN')}`,
      `₹${totalCredit.toLocaleString('en-IN')}`,
      `₹${runningBalance.toLocaleString('en-IN')}`,
    ],
  });
  
  downloadPDF(doc, `ledger_${staffName.replace(/\s+/g, '_')}`);
}

export function exportSalaryRegisterPDF(
  data: any[],
  month: string,
  canViewSalaries: boolean
) {
  const headers = canViewSalaries 
    ? ['Staff', 'Base Salary', 'Leave Days', 'Deduction', 'Net Salary', 'Advances Adj.', 'Paid']
    : ['Staff', 'Leave Days', 'Advances Adj.', 'Paid'];
  
  const tableData = data.map(s => {
    if (canViewSalaries) {
      return [
        s.staff?.full_name || '',
        `₹${Number(s.base_salary).toLocaleString('en-IN')}`,
        s.leave_days?.toString() || '0',
        `₹${Number(s.leave_deduction).toLocaleString('en-IN')}`,
        `₹${Number(s.net_salary).toLocaleString('en-IN')}`,
        `₹${Number(s.advances_adjusted).toLocaleString('en-IN')}`,
        `₹${Number(s.balance_payable).toLocaleString('en-IN')}`,
      ];
    } else {
      return [
        s.staff?.full_name || '',
        s.leave_days?.toString() || '0',
        `₹${Number(s.advances_adjusted).toLocaleString('en-IN')}`,
        `₹${Number(s.balance_payable).toLocaleString('en-IN')}`,
      ];
    }
  });
  
  const totalPaid = data.reduce((sum, s) => sum + (Number(s.balance_payable) || 0), 0);
  
  const totals = canViewSalaries
    ? ['Total', '', '', '', '', '', `₹${totalPaid.toLocaleString('en-IN')}`]
    : ['Total', '', '', `₹${totalPaid.toLocaleString('en-IN')}`];
  
  const doc = exportToPDF({
    title: 'Salary Register',
    subtitle: format(new Date(month + '-01'), 'MMMM yyyy'),
    headers,
    data: tableData,
    totals,
  });
  
  downloadPDF(doc, `salary_register_${month}`);
}

export function exportPaymentRegisterPDF(
  data: any[],
  dateRange: { from: Date; to: Date }
) {
  const tableData = data.map(entry => [
    format(new Date(entry.entry_date), 'dd/MM/yyyy'),
    entry.voucher_no,
    entry.staff?.full_name || '',
    entry.voucher_type?.replace('_', ' ').toUpperCase() || '',
    entry.payment_mode?.replace('_', ' ').toUpperCase() || '-',
    `₹${(Number(entry.credit) || Number(entry.debit) || 0).toLocaleString('en-IN')}`,
  ]);
  
  const total = data.reduce((sum, e) => sum + (Number(e.credit) || Number(e.debit) || 0), 0);
  
  const doc = exportToPDF({
    title: 'Payment Register',
    headers: ['Date', 'Voucher', 'Staff', 'Type', 'Mode', 'Amount'],
    data: tableData,
    dateRange,
    totals: ['Total', '', '', '', '', `₹${total.toLocaleString('en-IN')}`],
  });
  
  downloadPDF(doc, 'payment_register');
}

export function exportExpenseReportPDF(
  data: any[],
  dateRange: { from: Date; to: Date }
) {
  const tableData = data.map(expense => [
    format(new Date(expense.expense_date), 'dd/MM/yyyy'),
    expense.staff?.full_name || '',
    expense.category?.replace('_', ' ').toUpperCase() || '',
    expense.description?.substring(0, 30) || '',
    `₹${Number(expense.amount).toLocaleString('en-IN')}`,
  ]);
  
  const total = data.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  
  const doc = exportToPDF({
    title: 'Expense Reimbursement Report',
    headers: ['Date', 'Staff', 'Category', 'Description', 'Amount'],
    data: tableData,
    dateRange,
    totals: ['Total', '', '', '', `₹${total.toLocaleString('en-IN')}`],
  });
  
  downloadPDF(doc, 'expense_reimbursement');
}

export function exportAdvanceReportPDF(data: any[]) {
  const tableData = data.map(item => [
    item.staff?.full_name || '',
    item.staff?.employee_id || '',
    `₹${Number(item.totalAdvances).toLocaleString('en-IN')}`,
    `₹${Number(item.totalAdjusted).toLocaleString('en-IN')}`,
    `₹${Number(item.outstanding).toLocaleString('en-IN')}`,
  ]);
  
  const totalOutstanding = data.reduce((sum, e) => sum + (Number(e.outstanding) || 0), 0);
  
  const doc = exportToPDF({
    title: 'Advance Outstanding Report',
    subtitle: `As of ${format(new Date(), 'dd MMM yyyy')}`,
    headers: ['Staff Name', 'Employee ID', 'Total Advances', 'Adjusted', 'Outstanding'],
    data: tableData,
    totals: ['Total', '', '', '', `₹${totalOutstanding.toLocaleString('en-IN')}`],
  });
  
  downloadPDF(doc, 'advance_outstanding');
}

export function exportSummaryPDF(
  stats: {
    totalPayroll: number;
    totalAdvances: number;
    totalExpenses: number;
    totalPayments: number;
    staffCount: number;
  },
  month: string
) {
  const tableData = [
    ['Total Active Staff', stats.staffCount.toString()],
    ['Monthly Payroll Liability', `₹${stats.totalPayroll.toLocaleString('en-IN')}`],
    ['Total Settlements Paid', `₹${stats.totalPayments.toLocaleString('en-IN')}`],
    ['Advances Outstanding', `₹${stats.totalAdvances.toLocaleString('en-IN')}`],
    ['Expenses Reimbursed', `₹${stats.totalExpenses.toLocaleString('en-IN')}`],
  ];
  
  const doc = exportToPDF({
    title: 'Monthly Payroll Summary',
    subtitle: format(new Date(month + '-01'), 'MMMM yyyy'),
    headers: ['Metric', 'Value'],
    data: tableData,
  });
  
  downloadPDF(doc, `payroll_summary_${month}`);
}
