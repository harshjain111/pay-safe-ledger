import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Amount } from '@/components/ui/amount';
import { DashboardCard } from './DashboardCard';
import { QuickActionsCard, QuickAction } from './QuickActionsCard';
import { LeaveBalancesCard } from './LeaveBalancesCard';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useAttendanceSummary } from '@/hooks/useAttendanceSummary';
import { useBiometricEnrolment } from '@/hooks/useBiometricEnrolment';
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
  UserCheck,
  LogIn,
  Coffee,
  CheckCircle2,
  UserX,
  Fingerprint,
  type LucideIcon,
} from 'lucide-react';
import { format } from 'date-fns';

const CHIP = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  purple: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  pink: 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  grey: 'bg-muted text-muted-foreground',
};

export function OwnerDashboard() {
  const { stats, isLoading } = useDashboardStats();
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const currentMonth = format(now, 'MMMM yyyy');

  // Today's roll-up feeds the KPI; the band has its own date control.
  const [attDate, setAttDate] = useState(todayStr);
  const today = useAttendanceSummary(todayStr);
  const band = useAttendanceSummary(attDate);
  const bio = useBiometricEnrolment();

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
      href: '/approvals',
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

  // One action tile: accent + "Action needed" badge when there's work, muted
  // "All caught up" otherwise.
  const actionTile = (cfg: {
    label: string;
    count: number;
    amount?: number;
    subtitle: string;
    icon: LucideIcon;
    href: string;
  }) => {
    const needs = cfg.count > 0;
    return (
      <DashboardCard
        key={cfg.label}
        icon={cfg.icon}
        label={cfg.label}
        value={cfg.count}
        subtitle={needs ? cfg.subtitle : 'All caught up'}
        iconChip={needs ? CHIP.amber : CHIP.grey}
        href={needs ? cfg.href : undefined}
        tone={needs ? 'accent' : 'muted'}
        loading={isLoading}
        badge={
          needs ? (
            <span className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              Action needed
            </span>
          ) : undefined
        }
        rightSlot={
          needs && cfg.amount !== undefined ? (
            <Amount value={cfg.amount} size="sm" className="font-semibold" />
          ) : undefined
        }
      />
    );
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-6">
      <PageHeader title="Dashboard" description={`Overview for ${currentMonth}`}>
        <Link to="/staff/new">
          <Button className="rounded-xl shadow-lg text-sm sm:text-base px-3 sm:px-4">
            <Plus className="mr-1.5 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Staff</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </Link>
      </PageHeader>

      {/* Band 1 — KPI strip */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <DashboardCard
          icon={Users}
          label="Active Staff"
          value={stats.activeStaff}
          subtitle={stats.staffMissingSalary > 0 ? `${stats.staffMissingSalary} missing salary` : 'All set up'}
          iconChip={CHIP.blue}
          loading={isLoading}
        />
        <DashboardCard
          icon={Wallet}
          label="Monthly Payroll"
          value={`₹${stats.monthlyPayroll.toLocaleString('en-IN')}`}
          subtitle="Total liability"
          iconChip={CHIP.purple}
          loading={isLoading}
        />
        <DashboardCard
          icon={ArrowUpRight}
          label="Advances Outstanding"
          value={`₹${stats.advancesOutstanding.toLocaleString('en-IN')}`}
          subtitle="To be adjusted"
          iconChip={CHIP.orange}
          loading={isLoading}
        />
        <DashboardCard
          icon={Calculator}
          label="Current Period"
          value={format(now, 'MMM yyyy')}
          subtitle="Settlement period"
          iconChip={CHIP.pink}
        />
        <DashboardCard
          icon={UserCheck}
          label="Present Today"
          value={today.summary?.present ?? 0}
          subtitle={`of ${today.summary?.totalTracked ?? 0} tracked`}
          iconChip={CHIP.green}
          loading={today.isLoading}
        />
        <DashboardCard
          icon={Fingerprint}
          label="Pending Biometrics"
          value={bio.pending}
          subtitle={`of ${bio.total} tracked`}
          iconChip={bio.pending > 0 ? CHIP.amber : CHIP.green}
          href="/biometric-enrolment"
          loading={bio.isLoading}
        />
      </div>

      {/* Band 2 — Live attendance summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground">Live Attendance</h2>
          <Input
            type="date"
            value={attDate}
            max={todayStr}
            onChange={(e) => setAttDate(e.target.value || todayStr)}
            aria-label="Attendance date"
            className="h-9 w-auto"
          />
        </div>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <DashboardCard icon={LogIn} label="Checked In" value={band.summary?.checkedIn ?? 0} iconChip={CHIP.blue} loading={band.isLoading} />
          <DashboardCard icon={Coffee} label="On Break" value={band.summary?.onBreak ?? 0} iconChip={CHIP.amber} loading={band.isLoading} />
          <DashboardCard icon={CheckCircle2} label="Completed" value={band.summary?.completed ?? 0} iconChip={CHIP.green} loading={band.isLoading} />
          <DashboardCard icon={UserX} label="Absent" value={band.summary?.absent ?? 0} iconChip={CHIP.red} loading={band.isLoading} />
        </div>
      </div>

      {/* Band 3 — Action Required */}
      <div className="space-y-2 sm:space-y-3">
        <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground">Action Required</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {actionTile({ label: 'Pending Approvals', count: totalPendingApprovals, amount: totalPendingApprovalsAmount, subtitle: `${stats.pendingExpenses} expenses, ${stats.pendingRequests} advances`, icon: ClipboardList, href: '/approvals' })}
          {actionTile({ label: 'Salary Settlements Due', count: stats.pendingSalarySettlements, amount: stats.totalPendingSalaryAmount, subtitle: 'Pending salary payments', icon: Calculator, href: '/settlements?status=pending' })}
          {actionTile({ label: 'Payouts Pending', count: totalPendingPayouts, amount: totalPendingPayoutsAmount, subtitle: 'Approved and ready to pay', icon: CreditCard, href: '/payouts?status=approved' })}
          {actionTile({ label: 'Pending Expenses', count: stats.pendingExpenses, amount: stats.totalPendingExpensesAmount, subtitle: 'Expense claims awaiting approval', icon: Receipt, href: '/expenses?status=pending' })}
          {actionTile({ label: 'Pending Advances', count: stats.pendingRequests, amount: stats.totalPendingRequestsAmount, subtitle: 'Advance requests awaiting approval', icon: Banknote, href: '/approvals' })}
          {actionTile({ label: 'Staff Missing Salary', count: stats.staffMissingSalary, subtitle: 'Staff without salary setup', icon: UserPlus, href: '/staff?salary=missing' })}
        </div>
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
