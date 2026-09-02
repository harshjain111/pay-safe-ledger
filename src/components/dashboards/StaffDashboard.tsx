import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStaffBalance } from '@/hooks/useStaffBalance';
import { MyLeaveBalanceCard } from './MyLeaveBalanceCard';
import { TodayPresenceCard } from './TodayPresenceCard';
import { LanguageToggle } from '@/components/staff/LanguageToggle';
import { QuickAdvanceForm } from '@/components/staff/QuickAdvanceForm';
import { CreateLeaveDialog } from '@/components/leave/CreateLeaveDialog';
import { TeamLeaveApprovals } from '@/components/leave/TeamLeaveApprovals';
import { AttendanceWidget } from '@/components/attendance/AttendanceWidget';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Eye,
  EyeOff,
  Wallet,
  TrendingUp,
  Receipt,
  CalendarPlus,
  Clock,
  CheckCircle2,
  XCircle,
  Banknote,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type RecentItem = {
  id: string;
  type: 'advance';
  amount: number;
  status: string;
  created_at: string;
  description?: string;
};

export function StaffDashboard() {
  const navigate = useNavigate();
  const { staffData, isManager } = useAuth();
  const { t } = useLanguage();
  
  // CRITICAL: Use journal_lines as SINGLE SOURCE OF TRUTH for balance
  // This ensures Staff Dashboard matches Admin Ledger exactly
  const balanceData = useStaffBalance(staffData?.id);
  
  const [showSalary, setShowSalary] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);

  const fetchRecentItems = useCallback(async () => {
    if (!staffData?.id) return;

    try {
      // Fetch recent payment requests
      const { data: requests } = await supabase
        .from('payment_requests')
        .select('id, amount, status, created_at, reason, payout_type, paid_at')
        .eq('staff_id', staffData.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Combine and sort
      const combined: RecentItem[] = (requests || [])
        .map((r) => ({
          id: r.id,
          type: 'advance' as const,
          amount: r.amount,
          status: r.paid_at ? 'paid' : r.status,
          created_at: r.created_at,
          description: r.reason,
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6);

      setRecentItems(combined);
    } catch (error) {
      console.error('Error fetching recent items:', error);
    } finally {
      setIsLoadingRecent(false);
    }
  }, [staffData?.id]);

  useEffect(() => {
    if (staffData?.id) {
      fetchRecentItems();
    }
  }, [fetchRecentItems, staffData?.id]);

  const handleFormSuccess = () => {
    // Refetch recent items - balance will auto-update via useStaffBalance
    fetchRecentItems();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'paid':
      case 'reimbursed':
        return <Banknote className="h-4 w-4 text-success" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return t('pending');
      case 'approved':
        return t('approved');
      case 'rejected':
        return t('rejected');
      case 'paid':
        return t('paid');
      case 'reimbursed':
        return t('reimbursed');
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-warning/10 text-warning';
      case 'approved':
        return 'bg-success/10 text-success';
      case 'rejected':
        return 'bg-destructive/10 text-destructive';
      case 'paid':
      case 'reimbursed':
        return 'bg-success/10 text-success';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (!staffData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold">{t('error_occurred')}</h2>
        </div>
      </div>
    );
  }

  // Use balance loading state
  const isLoading = balanceData.isLoading || isLoadingRecent;
  
  // CRITICAL: advanceOutstanding comes from journal_lines (single source of truth)
  // This ensures Staff sees EXACTLY what Admin sees
  const advanceOutstanding = balanceData.advanceOutstanding;

  // Header + attendance render immediately; only balance-dependent content waits.
  const Header = (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t('welcome')}</p>
          <h1 className="text-xl font-bold truncate">{staffData.full_name.split(' ')[0]}</h1>
        </div>
        <span data-tour="language"><LanguageToggle /></span>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {Header}
        <div className="p-4 space-y-4 pb-8">
          <AttendanceWidget />
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {Header}

      <div className="p-4 space-y-4 pb-8">
        {/* Today's presence — status + login/log-off (always visible) */}
        <TodayPresenceCard userId={staffData?.user_id ?? undefined} />

        {/* Attendance widget */}
        <div data-tour="attendance"><AttendanceWidget /></div>

        {/* My weekly off + leave balance by type */}
        <MyLeaveBalanceCard
          staffId={staffData?.id}
          weeklyOffDay={(staffData as unknown as { weekly_off_day?: number | null })?.weekly_off_day ?? null}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Salary Card - tap anywhere to reveal/hide */}
          <Card
            className="relative overflow-hidden cursor-pointer transition-colors hover:bg-muted/30"
            role="button"
            tabIndex={0}
            aria-pressed={showSalary}
            aria-label={showSalary ? 'Hide salary' : 'Reveal salary'}
            onClick={() => setShowSalary((v) => !v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSalary((v) => !v); } }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <span className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground">
                  {showSalary ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{t('my_salary')}</p>
              {showSalary ? (
                <p className="text-xl font-bold">
                  ₹{staffData.monthly_salary.toLocaleString('en-IN')}
                </p>
              ) : (
                <p className="text-xl font-bold text-muted-foreground">••••••</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {showSalary ? 'Tap to hide' : t('tap_to_view')}
              </p>
            </CardContent>
          </Card>

          {/* Advance Outstanding Card - Data from journal_lines (single source of truth) */}
          <Card
            className="relative overflow-hidden cursor-pointer transition-colors hover:bg-muted/40"
            onClick={() => navigate('/requests')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('/requests'); }}
          >
            <CardContent className="p-4">
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center mb-2">
                <TrendingUp className="h-5 w-5 text-warning" />
              </div>
              <p className="text-xs text-muted-foreground mb-1">{t('my_advance')}</p>
              {advanceOutstanding > 0 ? (
                <p className="text-xl font-bold text-warning">
                  ₹{advanceOutstanding.toLocaleString('en-IN')}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('no_pending')}</p>
              )}
              {/* Debug: Show if there's a balance mismatch */}
              {balanceData.error && (
                <p className="text-xs text-destructive mt-1">{balanceData.error}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Manager inbox: pending leave from direct reports */}
        {isManager && <TeamLeaveApprovals />}

        {/* Big Action Buttons */}
        <div className="space-y-3" data-tour="quick-actions">
          <Button
            onClick={() => setShowAdvanceForm(true)}
            className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 shadow-lg"
            size="lg"
          >
            <Wallet className="mr-3 h-6 w-6" />
            {t('request_advance')}
          </Button>

          <Button
            onClick={() => setShowLeaveForm(true)}
            variant="secondary"
            className="w-full h-16 text-lg font-semibold shadow-lg"
            size="lg"
          >
            <CalendarPlus className="mr-3 h-6 w-6" />
            {t('request_leave')}
          </Button>
        </div>

        {/* Recent Requests */}
        <div className="pt-4">
          <h2 className="text-lg font-semibold mb-3">{t('recent_requests')}</h2>
          
          {recentItems.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Receipt className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground">{t('no_requests')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentItems.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-primary/10">
                          <Wallet className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">
                            ₹{item.amount.toLocaleString('en-IN')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                        {getStatusIcon(item.status)}
                        <span>{getStatusLabel(item.status)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Forms */}
      <QuickAdvanceForm
        open={showAdvanceForm}
        onOpenChange={setShowAdvanceForm}
        onSuccess={handleFormSuccess}
      />

      {staffData?.id && (
        <CreateLeaveDialog
          open={showLeaveForm}
          onOpenChange={setShowLeaveForm}
          staffId={staffData.id}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
