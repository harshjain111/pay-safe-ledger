import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Amount } from '@/components/ui/amount';
import { ActionTile } from './ActionTile';
import { QuickActionsCard, QuickAction } from './QuickActionsCard';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { AttendanceWidget } from '@/components/attendance/AttendanceWidget';
import {
  FileText,
  CreditCard,
  ClipboardList,
  Plus,
  ChevronRight,
  CheckCircle,
  Receipt,
  Banknote,
  Users,
  UserPlus,
} from 'lucide-react';
import { format } from 'date-fns';
import type { LedgerEntry } from '@/types/database';

export function AccountantDashboard() {
  const { user, accountingMode } = useAuth();
  const { stats, isLoading } = useDashboardStats();
  const [recentEntries, setRecentEntries] = useState<LedgerEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);

  useEffect(() => {
    fetchRecentEntries();
  }, [accountingMode]);

  const fetchRecentEntries = async () => {
    try {
      setEntriesLoading(true);
      const { data: entries, error } = await supabase
        .from('ledger_entries')
        .select('*')
        .not('voucher_type', 'eq', 'settlement')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentEntries(entries as LedgerEntry[] || []);
    } catch (error) {
      console.error('Error fetching recent entries:', error);
    } finally {
      setEntriesLoading(false);
    }
  };

  const totalPendingPayouts = stats.approvedExpenses + stats.approvedRequests;
  const totalPendingPayoutsAmount = stats.totalApprovedExpensesAmount + stats.totalApprovedRequestsAmount;

  const quickActions: QuickAction[] = [
    {
      label: 'Process Approved Payouts',
      description: 'Execute payments for approved items',
      icon: CreditCard,
      href: '/payouts',
      variant: 'primary',
      badge: totalPendingPayouts || undefined,
      badgeVariant: 'destructive',
    },
    {
      label: 'Request Advance',
      description: 'Create advance request for any staff',
      icon: Banknote,
      href: '/requests/new',
      variant: 'accent',
    },
    {
      label: 'Request Expense',
      description: 'Submit expense for any staff member',
      icon: Receipt,
      href: '/expenses/new',
      variant: 'accent',
    },
    {
      label: 'View Ledger',
      description: 'All financial transactions',
      icon: FileText,
      href: '/ledger',
      variant: 'muted',
    },
    {
      label: 'Add Staff',
      description: 'Register new employee (non-salary fields)',
      icon: UserPlus,
      href: '/staff/new',
      variant: 'secondary',
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="Accounting Dashboard"
        description="Execute payouts for approved requests and expenses"
      >
        <div className="flex flex-wrap gap-2">
          <Link to="/staff/new">
            <Button variant="outline">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Staff
            </Button>
          </Link>
          <Link to="/payouts">
            <Button>
              <CreditCard className="mr-2 h-4 w-4" />
              Payouts
            </Button>
          </Link>
        </div>
      </PageHeader>

      {/* Attendance widget */}
      <AttendanceWidget />

      {/* Summary Stats - Non-salary metrics only */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Entries"
          value={stats.completedPaymentsToday}
          subtitle="Recorded today"
          icon={FileText}
          color="blue"
        />
        <StatCard
          title="Pending Requests"
          value={stats.pendingRequests}
          subtitle="Awaiting approval"
          icon={ClipboardList}
          color="orange"
        />
        <StatCard
          title="Pending Payouts"
          value={totalPendingPayouts}
          subtitle="Ready to pay"
          icon={CreditCard}
          color="purple"
          variant={totalPendingPayouts > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Active Staff"
          value={stats.activeStaff}
          subtitle="Employees"
          icon={Users}
          color="pink"
        />
      </div>

      {/* Primary Action Tiles */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Payments to Process</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ActionTile
            title="Approved Expenses to Reimburse"
            count={stats.approvedExpenses}
            amount={stats.totalApprovedExpensesAmount}
            subtitle="Expense reimbursements pending"
            icon={Receipt}
            href="/payouts?type=expense"
            variant="warning"
          />
          <ActionTile
            title="Approved Advances to Pay"
            count={stats.approvedRequests}
            amount={stats.totalApprovedRequestsAmount}
            subtitle="Advance payments pending"
            icon={Banknote}
            href="/payouts?type=advance"
            variant="warning"
          />
          <ActionTile
            title="Completed Payments (Today)"
            count={stats.completedPaymentsToday}
            subtitle="Transactions recorded today"
            icon={CheckCircle}
            href="/ledger"
            variant="success"
            emptyMessage="No payments yet today"
          />
        </div>
      </div>

      {/* Quick Actions & Recent Entries */}
      <div className="grid gap-6 lg:grid-cols-2">
        <QuickActionsCard actions={quickActions} />

        {/* Recent Ledger Entries */}
        <Card className="rounded-2xl shadow-card border-0">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-semibold">Recent Entries</CardTitle>
              <CardDescription>Latest financial transactions</CardDescription>
            </div>
            <Link to="/ledger">
              <Button variant="ghost" size="sm" className="text-primary">
                View all
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No entries yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground truncate">
                          {entry.voucher_no}
                        </p>
                        <p className="text-sm font-medium capitalize truncate">
                          {entry.voucher_type}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {entry.credit && Number(entry.credit) > 0 ? (
                        <Amount value={entry.credit} className="text-success" size="sm" />
                      ) : (
                        <Amount value={entry.debit} size="sm" />
                      )}
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.entry_date), 'dd MMM')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
