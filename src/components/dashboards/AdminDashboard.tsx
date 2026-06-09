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
  ClipboardList,
  CreditCard,
  UserPlus,
  Receipt,
  Banknote,
  TrendingUp,
  FileText,
  UserCog,
} from 'lucide-react';
import { format } from 'date-fns';

export function AdminDashboard() {
  const { stats, isLoading } = useDashboardStats();
  const currentMonth = format(new Date(), 'MMMM yyyy');

  const totalPendingApprovals = stats.pendingExpenses + stats.pendingRequests;
  const totalPendingApprovalsAmount = stats.totalPendingExpensesAmount + stats.totalPendingRequestsAmount;
  
  const totalPendingPayouts = stats.approvedExpenses + stats.approvedRequests;
  const totalPendingPayoutsAmount = stats.totalApprovedExpensesAmount + stats.totalApprovedRequestsAmount;

  const quickActions: QuickAction[] = [
    {
      label: 'Approve / Reject Requests',
      description: 'Review pending expense & advance requests',
      icon: ClipboardList,
      href: '/requests?status=pending',
      variant: 'primary',
      badge: totalPendingApprovals || undefined,
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
      label: 'Add Staff',
      description: 'Register new employee (no salary)',
      icon: UserPlus,
      href: '/staff/new',
      variant: 'secondary',
    },
    {
      label: 'View Staff Directory',
      description: 'Manage employee records',
      icon: Users,
      href: '/staff',
      variant: 'muted',
    },
    {
      label: 'Execute Payouts',
      description: 'Pay approved advances & expenses',
      icon: CreditCard,
      href: '/payouts',
      variant: 'accent',
      badge: totalPendingPayouts || undefined,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 pb-6">
      <PageHeader
        title="Admin Dashboard"
        description={`Operations overview for ${currentMonth}`}
      >
        <Link to="/staff/new">
          <Button className="rounded-xl shadow-lg text-sm sm:text-base px-3 sm:px-4">
            <UserPlus className="mr-1.5 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Staff</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </Link>
      </PageHeader>

      {/* Summary Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Staff"
          value={stats.activeStaff}
          subtitle="Total employees"
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Pending Approvals"
          value={totalPendingApprovals}
          subtitle="Need your action"
          icon={ClipboardList}
          color="orange"
          variant={totalPendingApprovals > 0 ? 'warning' : 'default'}
        />
        <StatCard
          title="Pending Payouts"
          value={totalPendingPayouts}
          subtitle="Ready to pay"
          icon={CreditCard}
          color="purple"
        />
        <StatCard
          title="Today's Actions"
          value={stats.completedPaymentsToday}
          subtitle="Entries recorded"
          icon={TrendingUp}
          color="pink"
        />
      </div>

      {/* Action Tiles - Primary Focus */}
      <div className="space-y-2 sm:space-y-3">
        <h2 className="text-base sm:text-lg font-semibold text-foreground">Action Required</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <ActionTile
            title="Expense Requests Pending"
            count={stats.pendingExpenses}
            amount={stats.totalPendingExpensesAmount}
            subtitle="Expense claims awaiting approval"
            icon={Receipt}
            href="/expenses?status=pending"
            variant="warning"
          />
          <ActionTile
            title="Advance Requests Pending"
            count={stats.pendingRequests}
            amount={stats.totalPendingRequestsAmount}
            subtitle="Advance requests awaiting approval"
            icon={Banknote}
            href="/requests?status=pending"
            variant="warning"
          />
          <ActionTile
            title="New Staff (Salary Not Set)"
            count={stats.staffMissingSalary}
            subtitle="Pending Owner action"
            icon={UserCog}
            href="/staff?salary=missing"
            variant="info"
            emptyMessage="All staff configured"
          />
        </div>
      </div>

      {/* Secondary Tiles */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
        <ActionTile
          title="Requests Awaiting Owner"
          count={0}
          subtitle="Escalated for final approval"
          icon={ClipboardList}
          href="/requests?escalated=true"
          variant="info"
          emptyMessage="No escalations"
        />
        <ActionTile
          title="Payouts Ready"
          count={totalPendingPayouts}
          amount={totalPendingPayoutsAmount}
          subtitle="Approved & ready to execute"
          icon={CreditCard}
          href="/payouts?status=approved"
          variant="success"
        />
      </div>

      {/* Pending leave balances */}
      <LeaveBalancesCard />

      {/* Quick Actions */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <QuickActionsCard actions={quickActions} />

        <QuickActionsCard
          title="Navigation"
          description="Quick access to modules"
          actions={[
            {
              label: 'Review Expenses',
              description: 'All expense claims',
              icon: Receipt,
              href: '/expenses',
              variant: 'accent',
              badge: stats.pendingExpenses || undefined,
              badgeVariant: 'destructive',
            },
            {
              label: 'View Ledger',
              description: 'All financial transactions',
              icon: FileText,
              href: '/ledger',
              variant: 'muted',
            },
            {
              label: 'Manage Staff',
              description: 'View & edit employee records',
              icon: Users,
              href: '/staff',
              variant: 'muted',
            },
          ]}
        />
      </div>
    </div>
  );
}
