import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Ban, Banknote, CheckCircle2, CreditCard, Loader2, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName } from '@/lib/get-user-display-name';
import { queryKeys } from '@/lib/query-keys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Amount } from '@/components/ui/amount';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  PageHeader, DataTable, EmptyState, InlineNote, RowMenu,
  type DataTableColumn,
} from '@/components/patterns';
import { toast } from '@/lib/toast';
import { createAdvancePaidEntry, createSalaryPayoutEntry } from '@/lib/journal-entries';
import { CancelApprovalDialog } from '@/components/expenses/CancelApprovalDialog';
import type { PaymentMode, PaymentRequest, StaffPublic } from '@/types/database';

// ---------------------------------------------------------------------------
// PHASE 6 — /settlements/payouts "Advance Payouts". Advances (and the salary
// payouts queued by Process Payroll) only: the expense branch and the
// petty-cash payment mode are REMOVED — petty cash is being dropped, and its
// mode used to write petty_cash_transactions on advance payouts, which would
// crash after Phase 8's table drop.
// ---------------------------------------------------------------------------

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

interface ApprovedRequest extends Omit<PaymentRequest, 'payout_type' | 'settlement_id'> {
  staff: StaffPublic;
  payout_type?: string | null;
  settlement_id?: string | null;
}

type PayoutItem = {
  id: string;
  type: 'advance' | 'salary';
  staffName: string;
  staffId: string;
  employeeId: string;
  staffUserId?: string | null;
  amount: number;
  description: string;
  date: string;
  settlementId?: string | null;
  approvedByUserName?: string | null;
};

export default function Payouts() {
  const { user, staffData, isOwner, isAdmin, canRecordSalaryPayments, can } = useAuth();
  const queryClient = useQueryClient();
  const canExecutePayout = can('payouts.execute');

  const [items, setItems] = useState<PayoutItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<PayoutItem | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cancelItem, setCancelItem] = useState<PayoutItem | null>(null);

  const fetchApprovedItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const built: PayoutItem[] = [];

      const { data: advanceData, error: advanceError } = await supabase
        .from('payment_requests')
        .select('*, staff:staff_id(*)')
        .eq('status', 'approved')
        .is('paid_at', null)
        .or('payout_type.is.null,payout_type.eq.advance')
        .order('approved_at', { ascending: true });
      if (advanceError) throw advanceError;
      for (const request of (advanceData ?? []) as unknown as ApprovedRequest[]) {
        built.push({
          id: request.id,
          type: 'advance',
          staffName: request.staff?.full_name || 'Unknown',
          staffId: request.staff_id,
          employeeId: request.staff?.employee_id || '',
          staffUserId: request.staff?.user_id,
          amount: request.amount,
          description: `Advance: ${request.reason}`,
          date: request.approved_at || request.created_at,
          approvedByUserName: request.approved_by_user_name,
        });
      }

      if (canRecordSalaryPayments) {
        const { data: salaryData, error: salaryError } = await supabase
          .from('payment_requests')
          .select('*, staff:staff_id(*)')
          .eq('status', 'approved')
          .eq('payout_type', 'salary')
          .is('paid_at', null)
          .order('approved_at', { ascending: true });
        if (salaryError) throw salaryError;
        for (const salary of (salaryData ?? []) as unknown as ApprovedRequest[]) {
          built.push({
            id: salary.id,
            type: 'salary',
            staffName: salary.staff?.full_name || 'Unknown',
            staffId: salary.staff_id,
            employeeId: salary.staff?.employee_id || '',
            staffUserId: salary.staff?.user_id,
            amount: salary.amount,
            description: salary.reason,
            date: salary.approved_at || salary.created_at,
            settlementId: salary.settlement_id,
            approvedByUserName: salary.approved_by_user_name,
          });
        }
      }

      built.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setItems(built);
    } catch (error) {
      console.error('Error fetching approved items:', error);
      toast.error('Failed to load approved payouts');
    } finally {
      setIsLoading(false);
    }
  }, [canRecordSalaryPayments]);

  useEffect(() => {
    if (canExecutePayout) fetchApprovedItems();
    else setIsLoading(false);
  }, [canExecutePayout, fetchApprovedItems]);

  const handleExecutePayout = async () => {
    if (!selectedItem || !user) return;
    setIsProcessing(true);
    try {
      // Maker-checker: the payer is always the logged-in user.
      const paidByUserId = user.id;
      const paidByUserName = getUserDisplayName(user, staffData);
      const paidAt = new Date().toISOString();

      // Salary payouts MUST carry their settlement link (P2-H4).
      if (selectedItem.type === 'salary' && !selectedItem.settlementId) {
        throw new Error('This salary payout is missing its settlement link and cannot be paid. Please regenerate the salary settlement.');
      }

      // CLAIM-FIRST (P2-C1): flip the row to paid BEFORE posting any journal so
      // a double-click or second payer can never post the money-out twice.
      const { data: claimed, error: claimErr } = await supabase
        .from('payment_requests')
        .update({ paid_at: paidAt, paid_by: paidByUserId, paid_by_user_name: paidByUserName })
        .eq('id', selectedItem.id)
        .eq('status', 'approved')
        .is('paid_at', null)
        .select('id');
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) throw new Error('This item was already paid.');

      let journalEntryId = '';
      try {
        if (selectedItem.type === 'salary') {
          const monthMatch = selectedItem.description.match(/Salary for (.+)/);
          const settlementMonth = monthMatch ? monthMatch[1] : format(new Date(), 'MMMM yyyy');
          journalEntryId = await createSalaryPayoutEntry({
            staffId: selectedItem.staffId,
            staffName: selectedItem.staffName,
            settlementMonth,
            netPayable: selectedItem.amount,
            paymentMode,
            settlementId: selectedItem.settlementId || '',
            paymentRequestId: selectedItem.id,
            createdBy: user.id,
            paidByUserId,
            paidByUserName,
          });
        } else {
          journalEntryId = await createAdvancePaidEntry({
            staffId: selectedItem.staffId,
            staffName: selectedItem.staffName,
            amount: selectedItem.amount,
            paymentMode,
            paymentRequestId: selectedItem.id,
            createdBy: user.id,
            paidByUserId,
            paidByUserName,
          });
        }
      } catch (journalErr) {
        // Journal failed — release the claim so the item can be retried.
        await supabase
          .from('payment_requests')
          .update({ paid_at: null, paid_by: null, paid_by_user_name: null })
          .eq('id', selectedItem.id);
        throw journalErr;
      }

      // Reconcile the salary settlement now that the payout journal exists.
      if (selectedItem.type === 'salary' && selectedItem.settlementId) {
        await supabase
          .from('salary_settlements')
          .update({
            paid_at: paidAt,
            paid_by: paidByUserId,
            paid_by_user_name: paidByUserName,
            payment_mode: paymentMode,
            payout_journal_entry_id: journalEntryId,
          })
          .eq('id', selectedItem.settlementId);
      }

      if (selectedItem.staffUserId) {
        await supabase.rpc('create_notification', {
          _user_id: selectedItem.staffUserId,
          _title: selectedItem.type === 'advance' ? 'Advance Paid' : 'Salary Paid',
          _message: `Your ${selectedItem.type} of ₹${selectedItem.amount.toLocaleString('en-IN')} has been paid.`,
          _type: 'success',
          _reference_type: 'journal_entry',
          _reference_id: journalEntryId,
        });
      }

      toast.success(`₹${selectedItem.amount.toLocaleString('en-IN')} paid to ${selectedItem.staffName}.`);

      const payoutStaffId = selectedItem.staffId;
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staffBalance.byStaff(payoutStaffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.byStaff(payoutStaffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.advancesOutstanding.all });

      setSelectedItem(null);
      setPaymentMode('cash');
      fetchApprovedItems();
    } catch (error) {
      console.error('Error executing payout:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to execute payout. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!canExecutePayout) {
    return <EmptyState icon={Wallet} title="Access denied" instruction="Only users with the payout permission can execute payouts — ask an owner." />;
  }

  const columns: DataTableColumn<PayoutItem>[] = [
    { key: 'emp', header: 'Employee', width: 210, render: (i) => (
      <div>
        <p className="truncate font-medium leading-tight">{i.staffName}</p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{i.employeeId}</p>
      </div>
    ) },
    { key: 'type', header: 'Type', align: 'center', render: (i) => (
      <Badge variant={i.type === 'salary' ? 'default' : 'secondary'}>{i.type === 'salary' ? 'Salary' : 'Advance'}</Badge>
    ) },
    { key: 'desc', header: 'Description', render: (i) => <span className="block max-w-[22rem] truncate" title={i.description}>{i.description}</span> },
    { key: 'approved', header: 'Approved', render: (i) => (
      <div>
        <p className="leading-tight">{i.date ? format(new Date(i.date), 'dd MMM yyyy') : '—'}</p>
        {i.approvedByUserName && <p className="text-[11px] leading-tight text-muted-foreground">by {i.approvedByUserName}</p>}
      </div>
    ) },
    { key: 'amount', header: 'Amount', align: 'right', bold: true, render: (i) => i.amount.toLocaleString('en-IN') },
    {
      key: 'menu', header: '', align: 'center',
      render: (i) => (
        <RowMenu items={[
          { label: 'Pay', icon: CreditCard, onSelect: () => { setSelectedItem(i); setPaymentMode('cash'); } },
          ...(i.type === 'advance' && (isOwner || isAdmin)
            ? [{ label: 'Cancel Approval', icon: Ban, destructive: true, onSelect: () => setCancelItem(i) }]
            : []),
        ]} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Advance Payouts" count={isLoading ? undefined : items.length} />

      <InlineNote>
        Executing a payout posts the immutable money-out journal and marks the request paid. Advances recover
        automatically through monthly installments at payroll.
      </InlineNote>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(i) => `${i.type}-${i.id}`}
        stickyColumns={1}
        loading={isLoading}
        defaultPageSize={50}
        empty={<EmptyState icon={Banknote} title="No pending payouts" instruction="Approve advances on Approval Requests, or finalize payroll, to queue payouts here." />}
      />

      {/* Payout Confirmation Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Execute Payout</DialogTitle>
            <DialogDescription>Confirm payment details</DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant={selectedItem.type === 'salary' ? 'default' : 'secondary'}>
                    {selectedItem.type === 'salary' ? 'Salary' : 'Advance'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Staff</span>
                  <span className="max-w-[200px] truncate text-right font-medium">{selectedItem.staffName}</span>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">Description</span>
                  <span className="line-clamp-2 text-right text-xs">{selectedItem.description}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <Amount value={selectedItem.amount} className="text-lg font-bold text-primary" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Payment Made By</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm">
                  {getUserDisplayName(user, staffData)}
                </div>
                <p className="text-xs text-muted-foreground">Recorded automatically as the logged-in user for the audit trail.</p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => setSelectedItem(null)} disabled={isProcessing} className="w-full sm:w-auto">
              Go Back
            </Button>
            <Button onClick={handleExecutePayout} disabled={isProcessing} className="w-full sm:w-auto">
              {isProcessing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>) : (<><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Approval Dialog (advances only) */}
      <CancelApprovalDialog
        open={!!cancelItem}
        onOpenChange={(open) => !open && setCancelItem(null)}
        onSuccess={() => { setCancelItem(null); fetchApprovedItems(); }}
        item={cancelItem ? {
          id: cancelItem.id,
          type: 'advance',
          staffName: cancelItem.staffName,
          staffId: cancelItem.staffId,
          staffUserId: cancelItem.staffUserId,
          amount: cancelItem.amount,
          description: cancelItem.description,
        } : null}
      />
    </div>
  );
}
