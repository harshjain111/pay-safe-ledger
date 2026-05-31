 // Leave Accounting Types
 
 export type LeaveType = 'paid' | 'unpaid' | 'penalty' | 'custom';
 
 export type LeaveStatus = 'pending' | 'approved' | 'rejected';
 
 export interface LeaveRecord {
   id: string;
   staff_id: string;
   leave_date: string;
   leave_type: LeaveType;
   deduction_days: number;
   status: LeaveStatus;
   remarks?: string;
   rejection_reason?: string;
   created_by?: string;
   approved_by?: string;
   approved_at?: string;
   is_immutable: boolean;
   created_at: string;
   updated_at: string;
    staff?: {
      id: string;
      full_name: string;
      employee_id: string;
      user_id: string | null;
    };
 }
 
 export const LEAVE_TYPE_CONFIG: Record<LeaveType, { label: string; defaultDeduction: number; description: string }> = {
   paid: { label: 'Paid Leave', defaultDeduction: 0, description: 'No salary deduction' },
   unpaid: { label: 'Unpaid Leave', defaultDeduction: 1, description: '1 day salary deduction' },
   penalty: { label: 'Penalty Leave', defaultDeduction: 2, description: '2 days salary deduction' },
   custom: { label: 'Custom', defaultDeduction: 1, description: 'Owner-defined deduction' },
 };
 
 export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
   pending: 'Pending Approval',
   approved: 'Approved',
   rejected: 'Rejected',
 };