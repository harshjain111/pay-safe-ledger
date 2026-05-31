/**
 * Double-Entry Journal Entry Service
 * 
 * This service implements proper double-entry accounting (Golden Rules):
 * - Every transaction has two sides (debit and credit)
 * - Total debits must equal total credits
 * - Staff ledger balance represents net payable/receivable
 */

import { supabase } from '@/integrations/supabase/client';

export type TransactionType = 
  | 'salary_settlement'    // Debit: Salary Expense, Credit: Staff Payable
  | 'salary_payout'        // Debit: Staff Payable, Credit: Bank/Cash
  | 'expense_approval'     // Debit: Expense Head, Credit: Staff Payable
  | 'expense_payout'       // Debit: Staff Payable, Credit: Bank/Cash
  | 'advance_paid'         // Debit: Staff Advances (Receivable), Credit: Bank/Cash
  | 'advance_adjustment'   // Debit: Salary Expense (adjusted), Credit: Staff Advances
  | 'rectification'        // Equal & opposite reversal of a wrong entry
  | 'cancellation';        // Reversal of an approved transaction (before payout)

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'petty_cash';

export type ExpenseCategory = 
  | 'travel' 
  | 'food' 
  | 'logistics' 
  | 'equipment' 
  | 'office_supplies' 
  | 'communication' 
  | 'other';

interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  staffId?: string;
  description?: string;
}

interface CreateJournalEntryParams {
  transactionType: TransactionType;
  staffId: string;
  description: string;
  entryDate?: string;
  referenceId?: string;
  referenceType?: string;
  createdBy: string;
  lines: JournalLine[];
  isImmutable?: boolean;
}

interface SalarySettlementParams {
  staffId: string;
  staffName: string;
  settlementMonth: string;
  grossSalary: number;
  leaveDeduction: number;
  advanceAdjustment: number;
  pfEmployee?: number;
  pfEmployer?: number;
  esiEmployee?: number;
  esiEmployer?: number;
  settlementId: string;
  createdBy: string;
}

interface SalaryPayoutParams {
  staffId: string;
  staffName: string;
  settlementMonth: string;
  netPayable: number;
  paymentMode: PaymentMode;
  settlementId: string;
  paymentRequestId: string;
  createdBy: string;
   paidByUserId?: string;
   paidByUserName?: string;
}

interface ExpenseApprovalParams {
  staffId: string;
  staffName: string;
  expenseId: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  createdBy: string;
}

interface ExpensePayoutParams {
  staffId: string;
  staffName: string;
  expenseId: string;
  amount: number;
  paymentMode: PaymentMode;
  createdBy: string;
   paidByUserId?: string;
   paidByUserName?: string;
}

interface AdvancePaidParams {
  staffId: string;
  staffName: string;
  amount: number;
  paymentMode: PaymentMode;
  paymentRequestId: string;
  createdBy: string;
   paidByUserId?: string;
   paidByUserName?: string;
}

// Account code mapping
const ACCOUNT_CODES = {
  CASH: '1000',
  BANK: '1100',
  STAFF_ADVANCES: '1200',
  PETTY_CASH: '1300',
  STAFF_PAYABLE: '2000',
  EPF_PAYABLE: '2100',
  ESI_PAYABLE: '2200',
  SALARY_EXPENSE: '5000',
  EMPLOYER_PF_EXPENSE: '5050',
  EMPLOYER_ESI_EXPENSE: '5060',
  TRAVEL_EXPENSE: '5100',
  FOOD_EXPENSE: '5200',
  LOGISTICS_EXPENSE: '5300',
  EQUIPMENT_EXPENSE: '5400',
  OFFICE_SUPPLIES_EXPENSE: '5500',
  COMMUNICATION_EXPENSE: '5600',
  OTHER_EXPENSE: '5700',
};

const EXPENSE_CATEGORY_TO_ACCOUNT: Record<ExpenseCategory, string> = {
  travel: ACCOUNT_CODES.TRAVEL_EXPENSE,
  food: ACCOUNT_CODES.FOOD_EXPENSE,
  logistics: ACCOUNT_CODES.LOGISTICS_EXPENSE,
  equipment: ACCOUNT_CODES.EQUIPMENT_EXPENSE,
  office_supplies: ACCOUNT_CODES.OFFICE_SUPPLIES_EXPENSE,
  communication: ACCOUNT_CODES.COMMUNICATION_EXPENSE,
  other: ACCOUNT_CODES.OTHER_EXPENSE,
};

const PAYMENT_MODE_TO_ACCOUNT: Record<PaymentMode, string> = {
  cash: ACCOUNT_CODES.CASH,
  upi: ACCOUNT_CODES.BANK,
  bank_transfer: ACCOUNT_CODES.BANK,
  cheque: ACCOUNT_CODES.BANK,
  petty_cash: ACCOUNT_CODES.PETTY_CASH,
};

/**
 * Get account ID from account code
 */
async function getAccountId(code: string): Promise<string> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id')
    .eq('code', code)
    .single();
  
  if (error || !data) {
    throw new Error(`Account not found for code: ${code}`);
  }
  
  return data.id;
}

/**
 * Generate a unique reference number for a transaction type
 */
async function generateReferenceNo(transactionType: TransactionType): Promise<string> {
  const { data, error } = await supabase
    .rpc('generate_journal_ref', { _transaction_type: transactionType });
  
  if (error) {
    throw new Error(`Failed to generate reference number: ${error.message}`);
  }
  
  return data;
}

/**
 * Validate that debits equal credits
 */
function validateBalance(lines: JournalLine[]): void {
  const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry is unbalanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
  }
}

/**
 * Create a complete journal entry with all lines
 */
async function createJournalEntry(params: CreateJournalEntryParams): Promise<string> {
  const { 
    transactionType, 
    staffId, 
    description, 
    entryDate = new Date().toISOString().split('T')[0],
    referenceId,
    referenceType,
    createdBy,
    lines,
    isImmutable = false
  } = params;

  // Validate balance
  validateBalance(lines);

  // Generate reference number
  const referenceNo = await generateReferenceNo(transactionType);

  // Create journal entry header
  // Note: Empty string for UUID must be converted to null
  const { data: journalEntry, error: journalError } = await supabase
    .from('journal_entries')
    .insert({
      entry_date: entryDate,
      reference_no: referenceNo,
      description,
      transaction_type: transactionType,
      reference_id: referenceId || null, // Convert empty string to null
      reference_type: referenceType || null,
      staff_id: staffId,
      is_immutable: isImmutable,
      created_by: createdBy,
    })
    .select()
    .single();

  if (journalError || !journalEntry) {
    throw new Error(`Failed to create journal entry: ${journalError?.message}`);
  }

  // Create journal lines
  const lineInserts = await Promise.all(
    lines.map(async (line) => ({
      journal_entry_id: journalEntry.id,
      account_id: await getAccountId(line.accountCode),
      staff_id: line.staffId || null,
      debit: line.debit,
      credit: line.credit,
      description: line.description || null,
    }))
  );

  const { error: linesError } = await supabase
    .from('journal_lines')
    .insert(lineInserts);

  if (linesError) {
    // Rollback: delete the journal entry if lines fail
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    throw new Error(`Failed to create journal lines: ${linesError.message}`);
  }

  return journalEntry.id;
}

/**
 * SALARY SETTLEMENT
 * 
 * IMPORTANT: grossSalary parameter is the NET salary AFTER leave deduction.
 * The caller (Settlements.tsx) calculates: grossSalary = monthlySalary - leaveDeduction
 * 
 * When salary is settled (accrual - no cash movement):
 * 1. Debit: Salary Expense (the actual payable amount, which is grossSalary)
 * 2. Credit: Staff Payable (creates liability to pay staff)
 * 
 * If there's an advance adjustment:
 * 3. Debit: Staff Payable (reduce liability)
 * 4. Credit: Staff Advances (reduce what staff owes us)
 * 
 * ACCOUNTING RULES:
 * - Leave deduction is NOT a separate entry - it simply reduces salary expense
 * - Only the NET salary (after leave) creates a payable
 * - Advance adjustment is an internal settlement, NOT income/expense
 * - Advance adjustment has ZERO net effect on staff balance
 */
export async function createSalarySettlementEntry(params: SalarySettlementParams): Promise<string> {
  const {
    staffId,
    staffName,
    settlementMonth,
    grossSalary,  // Take-home BEFORE advance adjustment (already net of leave, discipline, employee PF & ESI)
    leaveDeduction: _leaveDeduction,
    advanceAdjustment,
    pfEmployee = 0,
    pfEmployer = 0,
    esiEmployee = 0,
    esiEmployer = 0,
    settlementId,
    createdBy,
  } = params;

  const netSalary = grossSalary;
  const lines: JournalLine[] = [];

  // Entry 1: Salary Expense Dr, Staff Payable Cr (take-home)
  if (netSalary > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.SALARY_EXPENSE,
      debit: netSalary,
      credit: 0,
      description: `Salary expense for ${staffName} - ${settlementMonth}`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.STAFF_PAYABLE,
      debit: 0,
      credit: netSalary,
      staffId,
      description: `Salary payable to ${staffName} - ${settlementMonth}`,
    });
  }

  // Entry 2: Employee PF withheld — Dr Salary Expense / Cr EPF Payable
  if (pfEmployee > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.SALARY_EXPENSE,
      debit: pfEmployee,
      credit: 0,
      description: `Employee PF for ${staffName} - ${settlementMonth}`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.EPF_PAYABLE,
      debit: 0,
      credit: pfEmployee,
      staffId,
      description: `Employee PF withheld - ${staffName} - ${settlementMonth}`,
    });
  }

  // Entry 3: Employee ESI withheld — Dr Salary Expense / Cr ESI Payable
  if (esiEmployee > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.SALARY_EXPENSE,
      debit: esiEmployee,
      credit: 0,
      description: `Employee ESI for ${staffName} - ${settlementMonth}`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.ESI_PAYABLE,
      debit: 0,
      credit: esiEmployee,
      staffId,
      description: `Employee ESI withheld - ${staffName} - ${settlementMonth}`,
    });
  }

  // Entry 4: Employer PF contribution — Dr Employer PF Expense / Cr EPF Payable
  if (pfEmployer > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.EMPLOYER_PF_EXPENSE,
      debit: pfEmployer,
      credit: 0,
      description: `Employer PF contribution for ${staffName} - ${settlementMonth}`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.EPF_PAYABLE,
      debit: 0,
      credit: pfEmployer,
      staffId,
      description: `Employer PF payable - ${staffName} - ${settlementMonth}`,
    });
  }

  // Entry 5: Employer ESI contribution — Dr Employer ESI Expense / Cr ESI Payable
  if (esiEmployer > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.EMPLOYER_ESI_EXPENSE,
      debit: esiEmployer,
      credit: 0,
      description: `Employer ESI contribution for ${staffName} - ${settlementMonth}`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.ESI_PAYABLE,
      debit: 0,
      credit: esiEmployer,
      staffId,
      description: `Employer ESI payable - ${staffName} - ${settlementMonth}`,
    });
  }

  // Entry 6: Advance adjustment (internal — reduces payable and advances)
  if (advanceAdjustment > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.STAFF_PAYABLE,
      debit: advanceAdjustment,
      credit: 0,
      staffId,
      description: `Advance adjustment against ${settlementMonth} salary`,
    });
    lines.push({
      accountCode: ACCOUNT_CODES.STAFF_ADVANCES,
      debit: 0,
      credit: advanceAdjustment,
      staffId,
      description: `Advance cleared for ${staffName}`,
    });
  }

  if (lines.length === 0) {
    throw new Error('No journal lines to create - salary is zero');
  }

  return createJournalEntry({
    transactionType: 'salary_settlement',
    staffId,
    description: `Salary settlement for ${staffName} - ${settlementMonth}`,
    referenceId: settlementId,
    referenceType: 'settlement',
    createdBy,
    lines,
    isImmutable: true,
  });
}

/**
 * SALARY PAYOUT
 * 
 * When salary is actually paid (cash movement):
 * 1. Debit: Staff Payable (clear liability)
 * 2. Credit: Bank/Cash (money goes out)
 * 
 * After this entry, staff balance should be ZERO
 */
export async function createSalaryPayoutEntry(params: SalaryPayoutParams): Promise<string> {
  const { 
    staffId, 
    staffName, 
    settlementMonth, 
    netPayable, 
    paymentMode, 
    settlementId,
    paymentRequestId,
    createdBy,
    paidByUserId,
    paidByUserName,
  } = params;

  if (netPayable <= 0) {
    throw new Error('Net payable must be greater than zero for payout');
  }

  const paymentAccountCode = PAYMENT_MODE_TO_ACCOUNT[paymentMode];

  const lines: JournalLine[] = [
    {
      accountCode: ACCOUNT_CODES.STAFF_PAYABLE,
      debit: netPayable,
      credit: 0,
      staffId,
      description: `Salary payment to ${staffName} - ${settlementMonth}`,
    },
    {
      accountCode: paymentAccountCode,
      debit: 0,
      credit: netPayable,
      description: `Paid via ${paymentMode.replace('_', ' ')}`,
    },
  ];

  // Validate balance
  validateBalance(lines);

  // Generate reference number
  const referenceNo = await generateReferenceNo('salary_payout');

  // Create journal entry header with paid_by fields
  const { data: journalEntry, error: journalError } = await supabase
    .from('journal_entries')
    .insert({
      entry_date: new Date().toISOString().split('T')[0],
      reference_no: referenceNo,
      description: `Salary paid to ${staffName} - ${settlementMonth}`,
      transaction_type: 'salary_payout',
      reference_id: paymentRequestId || null,
      reference_type: 'payment_request',
      staff_id: staffId,
      is_immutable: true,
      created_by: createdBy,
      paid_by: paidByUserId || createdBy,
      paid_by_user_name: paidByUserName || null,
    })
    .select()
    .single();

  if (journalError || !journalEntry) {
    throw new Error(`Failed to create journal entry: ${journalError?.message}`);
  }

  // Create journal lines
  const lineInserts = await Promise.all(
    lines.map(async (line) => ({
      journal_entry_id: journalEntry.id,
      account_id: await getAccountId(line.accountCode),
      staff_id: line.staffId || null,
      debit: line.debit,
      credit: line.credit,
      description: line.description || null,
    }))
  );

  const { error: linesError } = await supabase
    .from('journal_lines')
    .insert(lineInserts);

  if (linesError) {
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    throw new Error(`Failed to create journal lines: ${linesError.message}`);
  }

  return journalEntry.id;
}

/**
 * EXPENSE APPROVAL
 * 
 * When an expense is approved (creates payable to staff):
 * 1. Debit: Expense Account (based on category)
 * 2. Credit: Staff Payable (we owe staff this amount)
 */
export async function createExpenseApprovalEntry(params: ExpenseApprovalParams): Promise<string> {
  const { 
    staffId, 
    staffName, 
    expenseId, 
    amount, 
    category, 
    description, 
    createdBy 
  } = params;

  const expenseAccountCode = EXPENSE_CATEGORY_TO_ACCOUNT[category];

  const lines: JournalLine[] = [
    {
      accountCode: expenseAccountCode,
      debit: amount,
      credit: 0,
      description: `${category.replace('_', ' ')} expense - ${description}`,
    },
    {
      accountCode: ACCOUNT_CODES.STAFF_PAYABLE,
      debit: 0,
      credit: amount,
      staffId,
      description: `Expense reimbursement payable to ${staffName}`,
    },
  ];

  return createJournalEntry({
    transactionType: 'expense_approval',
    staffId,
    description: `Expense approved: ${description}`,
    referenceId: expenseId,
    referenceType: 'expense',
    createdBy,
    lines,
    isImmutable: false, // Can be modified until paid
  });
}

/**
 * EXPENSE PAYOUT
 * 
 * When expense is reimbursed (cash movement):
 * 1. Debit: Staff Payable (clear liability)
 * 2. Credit: Bank/Cash (money goes out)
 */
export async function createExpensePayoutEntry(params: ExpensePayoutParams): Promise<string> {
  const { 
    staffId, 
    staffName, 
    expenseId, 
    amount, 
    paymentMode, 
    createdBy,
    paidByUserId,
    paidByUserName,
  } = params;

  const paymentAccountCode = PAYMENT_MODE_TO_ACCOUNT[paymentMode];

  const lines: JournalLine[] = [
    {
      accountCode: ACCOUNT_CODES.STAFF_PAYABLE,
      debit: amount,
      credit: 0,
      staffId,
      description: `Expense reimbursed to ${staffName}`,
    },
    {
      accountCode: paymentAccountCode,
      debit: 0,
      credit: amount,
      description: `Paid via ${paymentMode.replace('_', ' ')}`,
    },
  ];

  // Validate balance
  validateBalance(lines);

  // Generate reference number
  const referenceNo = await generateReferenceNo('expense_payout');

  // Create journal entry header with paid_by fields
  const { data: journalEntry, error: journalError } = await supabase
    .from('journal_entries')
    .insert({
      entry_date: new Date().toISOString().split('T')[0],
      reference_no: referenceNo,
      description: `Expense reimbursed to ${staffName}`,
      transaction_type: 'expense_payout',
      reference_id: expenseId || null,
      reference_type: 'expense',
      staff_id: staffId,
      is_immutable: true,
      created_by: createdBy,
      paid_by: paidByUserId || createdBy,
      paid_by_user_name: paidByUserName || null,
    })
    .select()
    .single();

  if (journalError || !journalEntry) {
    throw new Error(`Failed to create journal entry: ${journalError?.message}`);
  }

  // Create journal lines
  const lineInserts = await Promise.all(
    lines.map(async (line) => ({
      journal_entry_id: journalEntry.id,
      account_id: await getAccountId(line.accountCode),
      staff_id: line.staffId || null,
      debit: line.debit,
      credit: line.credit,
      description: line.description || null,
    }))
  );

  const { error: linesError } = await supabase
    .from('journal_lines')
    .insert(lineInserts);

  if (linesError) {
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    throw new Error(`Failed to create journal lines: ${linesError.message}`);
  }

  return journalEntry.id;
}

/**
 * ADVANCE PAID
 * 
 * When an advance is given to staff:
 * 1. Debit: Staff Advances (staff owes us)
 * 2. Credit: Bank/Cash (money goes out)
 */
export async function createAdvancePaidEntry(params: AdvancePaidParams): Promise<string> {
  const { 
    staffId, 
    staffName, 
    amount, 
    paymentMode, 
    paymentRequestId,
    createdBy,
    paidByUserId,
    paidByUserName,
  } = params;

  const paymentAccountCode = PAYMENT_MODE_TO_ACCOUNT[paymentMode];

  const lines: JournalLine[] = [
    {
      accountCode: ACCOUNT_CODES.STAFF_ADVANCES,
      debit: amount,
      credit: 0,
      staffId,
      description: `Advance paid to ${staffName}`,
    },
    {
      accountCode: paymentAccountCode,
      debit: 0,
      credit: amount,
      description: `Paid via ${paymentMode.replace('_', ' ')}`,
    },
  ];

  // Validate balance
  validateBalance(lines);

  // Generate reference number
  const referenceNo = await generateReferenceNo('advance_paid');

  // Create journal entry header with paid_by fields
  const { data: journalEntry, error: journalError } = await supabase
    .from('journal_entries')
    .insert({
      entry_date: new Date().toISOString().split('T')[0],
      reference_no: referenceNo,
      description: `Advance paid to ${staffName}`,
      transaction_type: 'advance_paid',
      reference_id: paymentRequestId || null,
      reference_type: 'payment_request',
      staff_id: staffId,
      is_immutable: true,
      created_by: createdBy,
      paid_by: paidByUserId || createdBy,
      paid_by_user_name: paidByUserName || null,
    })
    .select()
    .single();

  if (journalError || !journalEntry) {
    throw new Error(`Failed to create journal entry: ${journalError?.message}`);
  }

  // Create journal lines
  const lineInserts = await Promise.all(
    lines.map(async (line) => ({
      journal_entry_id: journalEntry.id,
      account_id: await getAccountId(line.accountCode),
      staff_id: line.staffId || null,
      debit: line.debit,
      credit: line.credit,
      description: line.description || null,
    }))
  );

  const { error: linesError } = await supabase
    .from('journal_lines')
    .insert(lineInserts);

  if (linesError) {
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    throw new Error(`Failed to create journal lines: ${linesError.message}`);
  }

  return journalEntry.id;
}

/**
 * Get staff balance from journal entries
 * 
 * Returns the net payable/receivable for a staff member:
 * - Positive = Company owes staff (payable)
 * - Negative = Staff owes company (receivable)
 */
export async function getStaffJournalBalance(staffId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_staff_journal_balance', { _staff_id: staffId });
  
  if (error) {
    throw new Error(`Failed to get staff balance: ${error.message}`);
  }
  
  return Number(data) || 0;
}

/**
 * Get all journal entries for a staff member
 */
export async function getStaffJournalEntries(staffId: string) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(`
      *,
      lines:journal_lines(
        *,
        account:account_id(code, name, account_type)
      )
    `)
    .eq('staff_id', staffId)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to get journal entries: ${error.message}`);
  }

  return data;
}

/**
 * Get staff-specific lines with running balance
 * This is what should be displayed in the staff ledger view
 */
export async function getStaffLedgerFromJournals(staffId: string) {
  const { data, error } = await supabase
    .from('journal_lines')
    .select(`
      id,
      debit,
      credit,
      description,
      created_at,
      staff_id,
      journal_entry:journal_entry_id(
        id,
        entry_date,
        reference_no,
        description,
        transaction_type,
        is_legacy,
        is_immutable
      ),
      account:account_id(
        code,
        name,
        account_type
      )
    `)
    .eq('staff_id', staffId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to get staff ledger: ${error.message}`);
  }

  // Calculate running balance
  let runningBalance = 0;
  return (data || []).map(line => {
    // For staff ledger: Credit increases balance (we owe them), Debit decreases (they owe us)
    runningBalance += Number(line.credit) - Number(line.debit);
    return {
      ...line,
      running_balance: runningBalance,
    };
  });
}

/**
 * RECTIFICATION ENTRY
 * 
 * Creates an equal and opposite (reversal) journal entry to correct a wrong entry.
 * For example, if an expense was wrongly recorded as an advance:
 * - Original wrong entry: Dr Staff Advances, Cr Bank/Cash
 * - Rectification (reversal): Dr Bank/Cash, Cr Staff Advances (exact opposite)
 * 
 * The rectification entry references the original entry for audit trail.
 * Both entries remain in the ledger for complete transparency.
 */
export interface RectificationParams {
  originalJournalEntryId: string;
  staffId: string;
  staffName: string;
  reason: string;
  createdBy: string;
}

export async function createRectificationEntry(params: RectificationParams): Promise<string> {
  const { originalJournalEntryId, staffId, staffName, reason, createdBy } = params;

  // Fetch the original journal entry and its lines
  const { data: originalEntry, error: entryError } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', originalJournalEntryId)
    .single();

  if (entryError || !originalEntry) {
    throw new Error('Original journal entry not found');
  }

  const { data: originalLines, error: linesError } = await supabase
    .from('journal_lines')
    .select('*, account:account_id(code)')
    .eq('journal_entry_id', originalJournalEntryId);

  if (linesError || !originalLines || originalLines.length === 0) {
    throw new Error('Original journal lines not found');
  }

  // Create reversed lines (swap debit and credit)
  const reversedLines: JournalLine[] = originalLines.map(line => ({
    accountCode: (line.account as any)?.code || '',
    debit: Number(line.credit),   // Swap: original credit becomes debit
    credit: Number(line.debit),   // Swap: original debit becomes credit
    staffId: line.staff_id || undefined,
    description: `[RECTIFICATION] ${line.description || ''}`,
  }));

  // Validate balance
  validateBalance(reversedLines);

  return createJournalEntry({
    transactionType: 'rectification',
    staffId,
    description: `Rectification: ${reason} (reversal of ${originalEntry.reference_no})`,
    referenceId: originalJournalEntryId,
    referenceType: 'rectification',
    createdBy,
    lines: reversedLines,
    isImmutable: true,
  });
}

/**
 * CANCELLATION ENTRY
 * 
 * Creates a reversal journal entry to undo an approval that was done by mistake.
 * Used when admin/owner wants to cancel an approved expense or advance before payout.
 * 
 * For expense approvals:
 * - Original: Dr Expense Account, Cr Staff Payable
 * - Cancellation: Dr Staff Payable, Cr Expense Account (exact opposite)
 * 
 * The cancellation entry is immutable and references the original for audit trail.
 */
export interface CancellationParams {
  originalJournalEntryId: string;
  staffId: string;
  staffName: string;
  reason: string;
  createdBy: string;
  cancelledByUserName: string;
}

export async function createCancellationReversalEntry(params: CancellationParams): Promise<string> {
  const { originalJournalEntryId, staffId, staffName, reason, createdBy, cancelledByUserName } = params;

  // Fetch the original journal entry and its lines
  const { data: originalEntry, error: entryError } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', originalJournalEntryId)
    .single();

  if (entryError || !originalEntry) {
    throw new Error('Original journal entry not found');
  }

  const { data: originalLines, error: linesError } = await supabase
    .from('journal_lines')
    .select('*, account:account_id(code)')
    .eq('journal_entry_id', originalJournalEntryId);

  if (linesError || !originalLines || originalLines.length === 0) {
    throw new Error('Original journal lines not found');
  }

  // Create reversed lines (swap debit and credit)
  const reversedLines: JournalLine[] = originalLines.map(line => ({
    accountCode: (line.account as any)?.code || '',
    debit: Number(line.credit),
    credit: Number(line.debit),
    staffId: line.staff_id || undefined,
    description: `[CANCELLED] ${line.description || ''}`,
  }));

  validateBalance(reversedLines);

  return createJournalEntry({
    transactionType: 'cancellation',
    staffId,
    description: `Cancellation by ${cancelledByUserName}: ${reason} (reversal of ${originalEntry.reference_no})`,
    referenceId: originalJournalEntryId,
    referenceType: 'cancellation',
    createdBy,
    lines: reversedLines,
    isImmutable: true,
  });
}
