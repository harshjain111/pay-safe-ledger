// IMPORTANT: 'admin' role added for expense approval without salary visibility
export type AppRole = 'owner' | 'admin' | 'accountant' | 'staff' | 'ca';

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'petty_cash';

export type VoucherType = 'payment' | 'journal' | 'settlement' | 'advance' | 'deduction' | 'expense';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export type SettlementStatus = 'pending' | 'settled';

export type ExpenseCategory = 'travel' | 'food' | 'logistics' | 'equipment' | 'office_supplies' | 'communication' | 'other';

export type ExpenseStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'reimbursed';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  user_id: string | null;
  employee_id: string;
  full_name: string;
  email: string;
  phone?: string;
  department?: string;
  department_id?: string | null;
  outlet_id?: string | null;
  designation?: string;
  date_of_joining: string;
  date_of_leaving?: string | null;
  monthly_salary: number;
  basic_salary?: number;
  hra?: number;
  other_allowances?: number;
  pt_exempt?: boolean;
  pf_enrolled?: boolean;
  pf_employee_rate_override?: number | null;
  esi_enrolled?: boolean;
  esi_employee_rate?: number | null;
  is_active: boolean;
  attendance_tracked?: boolean;
  weekly_off_day?: number | null;
  ot_standard_minutes_override?: number | null;
  ot_multiplier_override?: number | null;
  // HR profile (all optional)
  photo_url?: string | null;
  reporting_manager_id?: string | null;
  location?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_ifsc?: string | null;
  bank_name?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type StaffDocumentType =
  | 'aadhaar' | 'pan' | 'bank_details' | 'education'
  | 'employment_contract' | 'experience_certificate' | 'other';

export interface StaffDocument {
  id: string;
  staff_id: string;
  doc_type: StaffDocumentType;
  doc_label?: string | null;
  doc_number?: string | null;
  file_url: string;
  file_name?: string | null;
  notes?: string | null;
  uploaded_by?: string | null;
  created_at: string;
}

export type EmploymentEventType =
  | 'promotion' | 'transfer' | 'salary_revision' | 'role_change' | 'other';

export interface EmploymentHistoryEntry {
  id: string;
  staff_id: string;
  event_type: EmploymentEventType;
  event_date: string;
  from_value?: string | null;
  to_value?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface StaffLoan {
  id: string;
  staff_id: string;
  principal: number;
  emi_amount: number;
  start_month: string;
  remaining_balance: number;
  status: 'active' | 'paused' | 'closed';
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffPublic {
  id: string;
  user_id: string | null;
  employee_id: string;
  full_name: string;
  email: string;
  phone?: string;
  department?: string;
  designation?: string;
  date_of_joining: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  staff_id: string;
  voucher_type: VoucherType;
  voucher_no: string;
  entry_date: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  tag?: 'salary' | 'advance' | 'deduction' | 'adjustment' | 'expense';
  reference_month?: string;
  payment_mode?: PaymentMode;
  paid_by?: string;
  approved_by?: string;
  is_immutable: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// ========================================
// DOUBLE-ENTRY ACCOUNTING TYPES
// ========================================

export type TransactionType = 
  | 'salary_settlement'
  | 'salary_payout'
  | 'expense_approval'
  | 'expense_payout'
  | 'advance_paid'
  | 'advance_adjustment';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id?: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  reference_no: string;
  description: string;
  transaction_type: TransactionType;
  reference_id?: string;
  reference_type?: string;
  staff_id?: string;
  is_immutable: boolean;
  is_legacy: boolean;
  created_by?: string;
  created_at: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  staff_id?: string;
  debit: number;
  credit: number;
  description?: string;
  created_at: string;
  running_balance?: number;
  journal_entry?: JournalEntry;
  account?: Account;
}

export interface PaymentRequest {
  id: string;
  staff_id: string;
  requested_by: string;
  amount: number;
  reason: string;
  status: RequestStatus;
  approved_by?: string;
  approved_by_user_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  paid_at?: string;
  paid_by?: string;
  ledger_entry_id?: string;
  payout_type?: 'advance' | 'salary';
  settlement_id?: string;
  created_at: string;
  updated_at: string;
  staff?: StaffPublic;
}

export interface SalarySettlement {
  id: string;
  staff_id: string;
  settlement_month: string;
  base_salary: number;
  leave_days: number;
  leave_deduction: number;
  net_salary: number;
  advances_adjusted: number;
  opening_advance_balance?: number;
  closing_advance_balance?: number;
  balance_payable: number;
  status: SettlementStatus;
  settled_at?: string;
  settled_by?: string;
  paid_at?: string;
  paid_by?: string;
  payment_mode?: string;
  ledger_entry_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  staff?: StaffPublic;
}

export interface Expense {
  id: string;
  staff_id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  expense_date: string;
  proof_url?: string;
  status: ExpenseStatus;
  submitted_at?: string;
  approved_by?: string;
  approved_by_user_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  reimbursed_at?: string;
  reimbursed_by?: string;
  ledger_entry_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  staff?: StaffPublic;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  reference_type?: string;
  reference_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  performed_by?: string;
  performed_at: string;
  ip_address?: string;
}

// Dashboard stats
export interface DashboardStats {
  totalStaff: number;
  activeStaff: number;
  totalPayrollLiability: number;
  advancesOutstanding: number;
  pendingRequests: number;
  pendingExpenses: number;
  monthlySettled: number;
  monthlyPending: number;
}

export interface StaffDashboardData {
  monthlySalary: number;
  totalAdvances: number;
  currentBalance: number;
  pendingRequests: number;
  pendingExpenses: number;
  lastPayment?: LedgerEntry;
  recentEntries: LedgerEntry[];
}

// Expense category labels
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel: 'Travel',
  food: 'Food & Meals',
  logistics: 'Logistics',
  equipment: 'Equipment',
  office_supplies: 'Office Supplies',
  communication: 'Communication',
  other: 'Other',
};

// Expense status labels
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  reimbursed: 'Reimbursed',
};
