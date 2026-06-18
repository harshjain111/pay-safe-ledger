// ============================================================================
// Leaves — DB service layer (the "endpoints" in this Supabase app).
//
// Thin IO wrappers over the new tables; the rules live in leave-allocation.ts
// (pure + tested). Uses the repo's loosely-typed `anyClient` for the new tables.
// ============================================================================

import { supabase } from '@/integrations/supabase/anyClient';
import { planAssignments, type LeaveTypeConfig, type Period } from './leave-allocation';

export interface LeaveType extends LeaveTypeConfig {
  id: string;
  name: string;
  code: string; // the spec's "alias"
  description: string | null;
  is_paid: boolean;
  default_deduction: number;
  is_active: boolean;
  created_at: string;
}

export interface LeaveTypeInput {
  name: string;
  code: string;
  description?: string | null;
  is_paid?: boolean;
  default_deduction?: number;
  no_of_auto_allocation_leaves: number;
  auto_allocation_period: Period;
  carry_forward_leaves: number;
  carry_forward_period: Period;
  encashment_enabled: boolean;
  encashment_limit: number | null;
  encashment_period: Period | null;
}

export async function listLeaveTypes(includeInactive = false): Promise<LeaveType[]> {
  let q = supabase.from('leave_types').select('*').order('sort_order').order('name');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LeaveType[];
}

export async function createLeaveType(input: LeaveTypeInput, userId: string | null): Promise<void> {
  const { error } = await supabase.from('leave_types').insert({ ...input, created_by: userId });
  if (error) throw error;
}

export async function updateLeaveType(id: string, input: Partial<LeaveTypeInput>): Promise<void> {
  const { error } = await supabase.from('leave_types').update(input).eq('id', id);
  if (error) throw error;
}

/** Soft-delete (default); block when balances exist, per the spec. */
export async function deleteLeaveType(id: string): Promise<void> {
  const { count } = await supabase
    .from('employee_leave_balance')
    .select('id', { count: 'exact', head: true })
    .eq('leave_type_id', id);
  if ((count ?? 0) > 0) {
    throw new Error('Cannot delete: this leave type is assigned to employees. Disable it instead.');
  }
  const { error } = await supabase.from('leave_types').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

/**
 * Idempotent assign: create employee_leave_balance rows (balance 0) only for the
 * (staff × type) pairs that don't already exist. Returns the number created.
 */
export async function assignLeaveTypes(staffIds: string[], leaveTypeIds: string[]): Promise<number> {
  if (staffIds.length === 0 || leaveTypeIds.length === 0) return 0;
  const { data: existing, error: exErr } = await supabase
    .from('employee_leave_balance')
    .select('staff_id, leave_type_id')
    .in('staff_id', staffIds)
    .in('leave_type_id', leaveTypeIds);
  if (exErr) throw exErr;
  const plan = planAssignments(staffIds, leaveTypeIds, (existing ?? []) as Array<{ staff_id: string; leave_type_id: string }>);
  if (plan.length === 0) return 0;
  const { error } = await supabase
    .from('employee_leave_balance')
    .insert(plan.map((p) => ({ ...p, balance: 0 })));
  if (error) throw error;
  return plan.length;
}

export interface BalanceRow {
  staff_id: string;
  leave_type_id: string;
  balance: number;
}

export async function listBalances(staffIds?: string[]): Promise<BalanceRow[]> {
  let q = supabase.from('employee_leave_balance').select('staff_id, leave_type_id, balance');
  if (staffIds && staffIds.length) q = q.in('staff_id', staffIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BalanceRow[];
}

/**
 * Bulk Adjust — OVERWRITE the chosen type's balance for each selected staff and
 * write a mandatory-remarks audit row (old → new) for each.
 */
export async function bulkAdjustBalance(opts: {
  staffIds: string[];
  leaveTypeId: string;
  newBalance: number;
  comment: string;
  userId: string | null;
}): Promise<void> {
  const { staffIds, leaveTypeId, newBalance, comment, userId } = opts;
  const { data: current } = await supabase
    .from('employee_leave_balance')
    .select('staff_id, balance')
    .eq('leave_type_id', leaveTypeId)
    .in('staff_id', staffIds);
  const oldByStaff = new Map<string, number>(((current ?? []) as Array<{ staff_id: string; balance: number }>).map((r) => [r.staff_id, Number(r.balance)]));

  const { error: upErr } = await supabase
    .from('employee_leave_balance')
    .upsert(staffIds.map((s) => ({ staff_id: s, leave_type_id: leaveTypeId, balance: newBalance })), { onConflict: 'staff_id,leave_type_id' });
  if (upErr) throw upErr;

  const { error: auErr } = await supabase
    .from('leave_balance_adjustment')
    .insert(staffIds.map((s) => ({
      staff_id: s,
      leave_type_id: leaveTypeId,
      old_balance: oldByStaff.get(s) ?? 0,
      new_balance: newBalance,
      remarks: comment,
      adjusted_by: userId,
    })));
  if (auErr) throw auErr;
}

/** Save many edited balances at once (spreadsheet bulk commit) — no audit row. */
export async function saveBalances(rows: BalanceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('employee_leave_balance')
    .upsert(rows, { onConflict: 'staff_id,leave_type_id' });
  if (error) throw error;
}
