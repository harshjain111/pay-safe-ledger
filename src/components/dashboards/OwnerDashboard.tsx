import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { ActionTile } from './ActionTile';
import { QuickActionsCard, QuickAction } from './QuickActionsCard';
import { LeaveBalancesCard } from './LeaveBalancesCard';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import {
  Users,
  Wallet,
  ArrowUpRight,
  Calculator,
  Plus,
  ClipboardList,
  Receipt,
  CreditCard,
  Banknote,
  TrendingUp,
  UserPlus,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';

export function OwnerDashboard() {
  const { stats, isLoading } = useDashboardStats();
  const currentMonth = format(new Date(), 'MMMM yyyy');

  const totalPendingApprovals = stats.pendingExpenses + stats.pendingRequests;
  const totalPendingApprovalsAmount = stats.totalPendingExpensesAmount + stats.totalPendingRequestsAmount;
  
  const totalPendingPayouts = stats.approvedExpenses + stats.approvedRequests + stats.pendingSalarySettlements;
  const totalPendingPayoutsAmount = stats.totalApprovedExpensesAmount + stats.totalApprovedRequestsAmount + stats.totalPendingSalaryAmount;

  const quickActions: QuickAction[] = [
    {
      label: 'Settle Salary',
      description: 'Process monthly salary settlements',
      icon: Calculator,
      href: '/settlements',
      variant: 'secondary',
      badge: stats.pendingSalarySettlements || undefined,
      badgeVariant: 'destructive',
    },
    {
      label: 'Approve Requests',
      description: 'Review pending expense & advance requests',
      icon: ClipboardList,
      href: '/requests?status=pending',
      variant: 'primary',
      badge: totalPendingApprovals || undefined,
      badgeVariant: 'destructive',
    },
    {
      label: 'Execute Payouts',
      description: 'Pay approved requests & expenses',
      icon: Wallet,
      href: '/payouts',
      variant: 'accent',
      badge: totalPendingPayouts || undefined,
    },
    {
      label: 'Add Salary to Staff',
      description: 'Set up salary for new staff members',
      icon: UserPlus,
      href: '/staff?salary=missing',
      variant: 'muted',
      badge: stats.staffMissingSalary || undefined,
      badgeVariant: 'destructive',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 pb-6">
      <PageHeader
        title="Dashboard"
        description={`Overview for ${currentMonth}`}
      >
        <Link to="/staff/new">
          <Button className="rounded-xl shadow-lg text-sm sm:text-base px-3 sm:px-4">
            <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Staff</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </Link>
      </PageHeader>

      {/* Summary Stats */}
      <div className="grid gap-3 sm:gap-4 lg:gap-5 grid-cols-2 xl:grid-cols-4">
        <StatCard
          loading={isLoading}
          title="Active Staff"
          value={stats.activeStaff}
          subtitle={stats.staffMissingSalary > 0 ? `${stats.staffMissingSalary} missing salary` : 'All set up'}
          icon={Users}
          color="blue"
        />
        <StatCard
          loading={isLoading}
          title="Monthly Payroll"
          value={`₹${stats.monthlyPayroll.toLocaleString('en-IN')}`}
          subtitle="Total liability"
          icon={Wallet}
          color="purple"
        />
        <StatCard
          loading={isLoading}
          title="Advances Outstanding"
          value={`₹${stats.advancesOutstanding.toLocaleString('en-IN')}`}
          subtitle="To be adjusted"
          icon={ArrowUpRight}
          color="orange"
        />
        <StatCard
          loading={isLoading}
          title="Current Period"
          value={format(new Date(), 'MMM yyyy')}
          subtitle="Settlement period"
          icon={Calculator}
          color="pink"
        />
      </div>

      {/* Action Tiles - Clickable */}
      <div className="space-y-2 sm:space-y-3">
        <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground">Action Required</h2>
        <div className="grid gap-3 sm:gap-4 lg:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          <ActionTile
            title="Pending Approvals"
            count={totalPendingApprovals}
            amount={totalPendingApprovalsAmount}
            subtitle={`${stats.pendingExpenses} expenses, ${stats.pendingRequests} advances`}
            icon={ClipboardList}
            href="/requests?status=pending"
            variant="warning"
          />
          <ActionTile
            title="Salary Settlements Due"
            count={stats.pendingSalarySettlements}
            amount={stats.totalPendingSalaryAmount}
            subtitle="Pending salary payments"
            icon={Calculator}
            href="/settlements?status=pending"
            variant="warning"
          />
          <ActionTile
            title="Payouts Pending"
            count={totalPendingPayouts}
            amount={totalPendingPayoutsAmount}
            subtitle="Approved and ready to pay"
            icon={CreditCard}
            href="/payouts?status=approved"
            variant="info"
          />
        </div>
      </div>

      {/* Secondary Stats Tiles */}
      <div className="grid gap-3 sm:gap-4 lg:gap-5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        <ActionTile
          title="Pending Expenses"
          count={stats.pendingExpenses}
          amount={stats.totalPendingExpensesAmount}
          subtitle="Expense claims awaiting approval"
          icon={Receipt}
          href="/expenses?status=pending"
          variant="warning"
        />
        <ActionTile
          title="Pending Advances"
          count={stats.pendingRequests}
          amount={stats.totalPendingRequestsAmount}
          subtitle="Advance requests awaiting approval"
          icon={Banknote}
          href="/requests?status=pending"
          variant="warning"
        />
        <ActionTile
          title="Staff Missing Salary"
          count={stats.staffMissingSalary}
          subtitle="Staff members without salary setup"
          icon={UserPlus}
          href="/staff?salary=missing"
          variant="warning"
          emptyMessage="All staff configured"
        />
      </div>

      {/* Pending leave balances */}
      <LeaveBalancesCard />

      {/* Quick Actions & Reports */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <QuickActionsCard actions={quickActions} />

        <QuickActionsCard
          title="Reports & Insights"
          description="View financial summaries"
          actions={[
            {
              label: 'View Reports',
              description: 'Generate payroll & expense reports',
              icon: TrendingUp,
              href: '/reports',
              variant: 'muted',
            },
            {
              label: 'View Ledger',
              description: 'All financial transactions',
              icon: FileText,
              href: '/ledger',
              variant: 'muted',
            },
            {
              label: 'Review Expenses',
              description: 'All expense claims',
              icon: Receipt,
              href: '/expenses',
              variant: 'accent',
              badge: stats.pendingExpenses || undefined,
              badgeVariant: 'destructive',
            },
          ]}
        />
      </div>
    </div>
  );
}
