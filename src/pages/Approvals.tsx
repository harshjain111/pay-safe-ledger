import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { ErrorState } from '@/components/layout/ErrorState';
import { ListSkeleton } from '@/components/layout/ListSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Amount } from '@/components/ui/amount';
import { StatusBadge } from '@/components/ui/status-badge';
import { FilterBar } from '@/components/layout/filter-bar';
import { StatusTabs, DEFAULT_STATUS_TABS } from '@/components/ui/status-tabs';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ClipboardList, Search, Check, X, Eye, Loader2, Wallet, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/lib/toast';
import type { PaymentRequest, Expense, ExpenseCategory, RequestStatus } from '@/types/database';
import { EXPENSE_CATEGORY_LABELS } from '@/types/database';
import { approveAdvanceRequest, rejectAdvanceRequest } from '@/lib/advance-approvals';
import { ApproveExpenseDialog } from '@/components/expenses/ApproveExpenseDialog';
import { RejectExpenseDialog } from '@/components/expenses/RejectExpenseDialog';
import { refetchNotificationCounts } from '@/hooks/useNotificationCounts';

// A single row in the unified approvals queue — either an advance request or an
// expense claim, normalized to a common shape (the raw record is kept for the
// reused mutations + ledger preview).
interface ApprovalItem {
  kind: 'advance' | 'expense';
  id: string;
  requestedBy: string;
  staffUserId: string | null;
  details: string;
  category?: ExpenseCategory;
  date: string;
  amount: number;
  status: string;
  raw: PaymentRequest | Expense;
}

type StatusBucket = 'pending' | 'approved' | 'rejected';

function statusBucket(status: string): StatusBucket | 'other' {
  if (status === 'pending') return 'pending';
  if (status === 'approved' || status === 'paid' || status === 'reimbursed') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'other';
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusVariant(status: string): 'warning' | 'info' | 'destructive' | 'success' | 'secondary' {
  switch (statusBucket(status)) {
    case 'pending': return 'warning';
    case 'approved': return status === 'paid' || status === 'reimbursed' ? 'success' : 'info';
    case 'rejected': return 'destructive';
    default: return 'secondary';
  }
}

/**
 * Ledger impact preview — our edge over PetPooja: show the manager the exact
 * double-entry that approving (or later paying) will post. Display only; the
 * real entries are created by the reused mutations.
 */
function LedgerImpactPreview({ item }: { item: ApprovalItem }) {
  const amt = `₹${item.amount.toLocaleString('en-IN')}`;
  const rows =
    item.kind === 'expense'
      ? [
          { label: `${item.category ? EXPENSE_CATEGORY_LABELS[item.category] : 'Expense'} (expense head)`, dr: amt, cr: '' },
          { label: `Staff Payable — ${item.requestedBy}`, dr: '', cr: amt },
        ]
      : [
          { label: `Staff Advances — ${item.requestedBy}`, dr: amt, cr: '' },
          { label: 'Cash / Bank', dr: '', cr: amt },
        ];

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        Ledger impact {item.kind === 'expense' ? '(posted on approval)' : '(posted when paid out)'}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-medium pb-1">Account</th>
            <th className="text-right font-medium pb-1">Debit</th>
            <th className="text-right font-medium pb-1">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5 pr-2">{r.label}</td>
              <td className="py-1.5 text-right font-mono tabular-nums">{r.dr || '—'}</td>
              <td className="py-1.5 text-right font-mono tabular-nums">{r.cr || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {item.kind === 'advance' && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Approving only marks the advance ready for payout — no journal entry is posted until it is paid in Payouts.
        </p>
      )}
    </div>
  );
}

export default function Approvals() {
  const {
    user,
    staffData,
    isOwner,
    isAdmin,
    isAccountant,
    accountingMode,
    canApproveRequests,
    canApproveExpenses,
  } = useAuth();

  // Who can open this screen — mirrors the sidebar visibility for "Approvals".
  const canView = isOwner || isAdmin || (isAccountant && accountingMode);

  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'advance' | 'expense'>('all');
  const [search, setSearch] = useState('');

  // Per-row processing (advance inline approve/reject).
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Advance dialogs (built here); expense dialogs are reused from the Expenses module.
  const [advanceApprove, setAdvanceApprove] = useState<ApprovalItem | null>(null);
  const [advanceReject, setAdvanceReject] = useState<ApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expenseApprove, setExpenseApprove] = useState<Expense | null>(null);
  const [expenseReject, setExpenseReject] = useState<Expense | null>(null);
  const [drawerItem, setDrawerItem] = useState<ApprovalItem | null>(null);

  const fetchItems = useCallback(async () => {
    if (!canView) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setHasError(false);
    try {
      const [advancesRes, expensesRes] = await Promise.all([
        supabase
          .from('payment_requests')
          .select(`
            *,
            staff:staff_id (
              id, user_id, employee_id, full_name, email, phone,
              department, designation, date_of_joining, is_active,
              created_at, updated_at
            )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('expenses')
          .select('*, staff:staff_public(*)')
          .neq('status', 'draft')
          .order('created_at', { ascending: false }),
      ]);

      if (advancesRes.error) throw advancesRes.error;
      if (expensesRes.error) throw expensesRes.error;

      const advances: ApprovalItem[] = ((advancesRes.data || []) as unknown as PaymentRequest[]).map((r) => ({
        kind: 'advance',
        id: r.id,
        requestedBy: r.staff?.full_name || 'Staff',
        staffUserId: r.staff?.user_id ?? null,
        details: r.reason,
        date: r.created_at,
        amount: Number(r.amount),
        status: r.status,
        raw: r,
      }));

      const expenses: ApprovalItem[] = ((expensesRes.data || []) as unknown as Expense[]).map((e) => ({
        kind: 'expense',
        id: e.id,
        requestedBy: e.staff?.full_name || 'Staff',
        staffUserId: e.staff?.user_id ?? null,
        details: e.description,
        category: e.category,
        date: e.expense_date || e.created_at,
        amount: Number(e.amount),
        status: e.status,
        raw: e,
      }));

      // Most-recent first across both types.
      const merged = [...advances, ...expenses].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setItems(merged);
    } catch (error) {
      console.error('Error loading approvals:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const pendingCount = useMemo(
    () => items.filter((i) => statusBucket(i.status) === 'pending').length,
    [items]
  );

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (typeFilter !== 'all' && i.kind !== typeFilter) return false;
      if (activeTab !== 'all' && statusBucket(i.status) !== activeTab) return false;
      if (q && !i.requestedBy.toLowerCase().includes(q) && !i.details.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, typeFilter, activeTab, search]);

  const canActOn = (item: ApprovalItem) =>
    item.status === 'pending' && (item.kind === 'advance' ? canApproveRequests : canApproveExpenses);

  const afterMutation = () => {
    refetchNotificationCounts();
    fetchItems();
  };

  const doApproveAdvance = async (item: ApprovalItem) => {
    setProcessingId(item.id);
    try {
      await approveAdvanceRequest({ request: item.raw as PaymentRequest, user, staffData });
      toast.success('Advance approved — now available in Payouts');
      afterMutation();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setProcessingId(null);
      setAdvanceApprove(null);
      setDrawerItem(null);
    }
  };

  const doRejectAdvance = async () => {
    if (!advanceReject) return;
    setProcessingId(advanceReject.id);
    try {
      await rejectAdvanceRequest({ request: advanceReject.raw as PaymentRequest, reason: rejectReason, user, staffData });
      toast.success('Advance rejected');
      setRejectReason('');
      afterMutation();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reject');
    } finally {
      setProcessingId(null);
      setAdvanceReject(null);
      setDrawerItem(null);
    }
  };

  // Approve/Reject dispatch by type — advances use the shared lib (inline
  // confirm/reason dialogs); expenses reuse the existing expense dialogs.
  const onApprove = (item: ApprovalItem) => {
    if (item.kind === 'advance') setAdvanceApprove(item);
    else setExpenseApprove(item.raw as Expense);
  };
  const onReject = (item: ApprovalItem) => {
    if (item.kind === 'advance') setAdvanceReject(item);
    else setExpenseReject(item.raw as Expense);
  };

  if (!canView) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Access Denied"
        description="Only owners, admins and accountants can review approvals."
      />
    );
  }

  const RowActions = ({ item }: { item: ApprovalItem }) => (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View details" onClick={() => setDrawerItem(item)}>
        <Eye className="h-4 w-4" />
      </Button>
      {canActOn(item) && (
        <>
          <Button
            variant="outline"
            size="icon"
            aria-label="Approve"
            className="text-success hover:text-success h-8 w-8"
            disabled={processingId !== null}
            onClick={() => onApprove(item)}
          >
            {processingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Reject"
            className="text-destructive hover:text-destructive h-8 w-8"
            disabled={processingId !== null}
            onClick={() => onReject(item)}
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );

  const TypeCell = ({ item }: { item: ApprovalItem }) => (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      {item.kind === 'advance' ? (
        <Wallet className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      ) : (
        <Receipt className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
      )}
      {item.kind === 'advance' ? 'Advance' : 'Expense'}
    </span>
  );

  const approvalColumns: DataTableColumn<ApprovalItem>[] = [
    { id: 'type', header: 'Type', sortable: true, sortAccessor: (i) => i.kind, cell: (i) => <TypeCell item={i} /> },
    { id: 'requestedBy', header: 'Requested by', sortable: true, sortAccessor: (i) => i.requestedBy, cellClassName: 'font-medium', cell: (i) => i.requestedBy },
    {
      id: 'details',
      header: 'Details',
      cellClassName: 'max-w-[280px]',
      cell: (i) => (
        <>
          <span className="block truncate" title={i.details}>{i.details || '—'}</span>
          {i.kind === 'expense' && i.category && (
            <span className="text-[11px] text-muted-foreground">{EXPENSE_CATEGORY_LABELS[i.category]}</span>
          )}
        </>
      ),
    },
    {
      id: 'date',
      header: 'Date',
      sortable: true,
      sortAccessor: (i) => new Date(i.date),
      cellClassName: 'whitespace-nowrap text-sm text-muted-foreground',
      cell: (i) => format(new Date(i.date), 'dd MMM yyyy'),
    },
    { id: 'amount', header: 'Amount', align: 'right', sortable: true, sortAccessor: (i) => i.amount, cell: (i) => <Amount value={i.amount} size="sm" /> },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: (i) => i.status,
      cell: (i) => (
        <StatusBadge status={i.status as RequestStatus} variant={statusVariant(i.status)}>
          {statusLabel(i.status)}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-6">
      <PageHeader
        title="Approvals"
        description="Review and clear advance and expense requests from one place."
      >
        {pendingCount > 0 && (
          <span className="rounded-full bg-destructive/15 px-3 py-1 text-sm font-semibold text-destructive">
            {pendingCount} pending
          </span>
        )}
      </PageHeader>

      {/* Filters */}
      <StatusTabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        tabs={DEFAULT_STATUS_TABS}
      />

      <FilterBar
        filters={
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="advance">Advances</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
            </SelectContent>
          </Select>
        }
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or details…"
      />

      {/* Table */}
      {hasError ? (
        <Card>
          <CardContent className="p-0">
            <ErrorState onRetry={fetchItems} />
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={approvalColumns}
          data={visibleItems}
          rowKey={(item) => `${item.kind}-${item.id}`}
          isLoading={isLoading}
          initialSort={{ columnId: 'date', direction: 'desc' }}
          rowActions={(item) => <RowActions item={item} />}
          actionsHeader="Actions"
          emptyState={
            <EmptyState
              icon={ClipboardList}
              title="Nothing to show"
              description={
                activeTab === 'pending'
                  ? 'No pending approvals right now.'
                  : 'No items match the current filters.'
              }
            />
          }
        />
      )}

      {/* Detail drawer */}
      <Sheet open={!!drawerItem} onOpenChange={(o) => !o && setDrawerItem(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {drawerItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <TypeCell item={drawerItem} />
                  <span className="text-muted-foreground">·</span>
                  {drawerItem.requestedBy}
                </SheetTitle>
                <SheetDescription>Request details and accounting impact.</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <Amount value={drawerItem.amount} size="md" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <StatusBadge status={drawerItem.status as RequestStatus} variant={statusVariant(drawerItem.status)}>
                      {statusLabel(drawerItem.status)}
                    </StatusBadge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p>{format(new Date(drawerItem.date), 'dd MMM yyyy')}</p>
                  </div>
                  {drawerItem.kind === 'expense' && drawerItem.category && (
                    <div>
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p>{EXPENSE_CATEGORY_LABELS[drawerItem.category]}</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Details</p>
                  <p className="text-sm">{drawerItem.details || '—'}</p>
                </div>

                <LedgerImpactPreview item={drawerItem} />

                {canActOn(drawerItem) && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                      disabled={processingId !== null}
                      onClick={() => onApprove(drawerItem)}
                    >
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-destructive hover:text-destructive"
                      disabled={processingId !== null}
                      onClick={() => onReject(drawerItem)}
                    >
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Advance — approve confirmation */}
      <AlertDialog open={!!advanceApprove} onOpenChange={(o) => !o && processingId === null && setAdvanceApprove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this advance?</AlertDialogTitle>
            <AlertDialogDescription>
              {advanceApprove && (
                <>
                  Approve the advance of{' '}
                  <span className="font-semibold text-foreground">₹{advanceApprove.amount.toLocaleString('en-IN')}</span>{' '}
                  for <span className="font-semibold text-foreground">{advanceApprove.requestedBy}</span>? It becomes
                  available in Payouts.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (advanceApprove) doApproveAdvance(advanceApprove);
              }}
              disabled={processingId !== null}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {processingId !== null ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving…</>
              ) : (
                'Approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Advance — reject reason */}
      <Dialog open={!!advanceReject} onOpenChange={(o) => !o && processingId === null && (setAdvanceReject(null), setRejectReason(''))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject advance</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this advance request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAdvanceReject(null); setRejectReason(''); }} disabled={processingId !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doRejectAdvance} disabled={processingId !== null || !rejectReason.trim()}>
              {processingId !== null ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rejecting…</>) : 'Reject Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense dialogs — reused from the Expenses module (same business logic) */}
      {expenseApprove && (
        <ApproveExpenseDialog
          expense={expenseApprove}
          open={!!expenseApprove}
          onOpenChange={(o) => { if (!o) setExpenseApprove(null); }}
          onSuccess={() => { setExpenseApprove(null); setDrawerItem(null); afterMutation(); }}
        />
      )}
      {expenseReject && (
        <RejectExpenseDialog
          expense={expenseReject}
          open={!!expenseReject}
          onOpenChange={(o) => { if (!o) setExpenseReject(null); }}
          onSuccess={() => { setExpenseReject(null); setDrawerItem(null); afterMutation(); }}
        />
      )}
    </div>
  );
}
