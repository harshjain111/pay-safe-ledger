import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStaffBalance } from '@/hooks/useStaffBalance';
import { MyLeaveBalanceCard } from './MyLeaveBalanceCard';
import { LanguageToggle } from '@/components/staff/LanguageToggle';
import { QuickAdvanceForm } from '@/components/staff/QuickAdvanceForm';
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
  Clock,
  CheckCircle2,
  XCircle,
  Banknote,
  Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { PaymentRequest, Expense } from '@/types/database';

type RecentItem = {
  id: string;
  type: 'advance' | 'expense';
  amount: number;
  status: string;
  created_at: string;
  description?: string;
};

export function StaffDashboard() {
  const navigate = useNavigate();
  const { staffData } = useAuth();
  const { t } = useLanguage();
  
  // CRITICAL: Use journal_lines as SINGLE SOURCE OF TRUTH for balance
  // This ensures Staff Dashboard matches Admin Ledger exactly
  const balanceData = useStaffBalance(staffData?.id);
  
  const [showSalary, setShowSalary] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);

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

      // Fetch recent expenses
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, amount, status, created_at, description')
        .eq('staff_id', staffData.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Combine and sort
      const combined: RecentItem[] = [
        ...(requests || []).map((r) => ({
          id: r.id,
          type: 'advance' as const,
          amount: r.amount,
          status: r.paid_at ? 'paid' : r.status,
          created_at: r.created_at,
          description: r.reason,
        })),
        ...(expenses || []).map((e) => ({
          id: e.id,
          type: 'expense' as const,
          amount: e.amount,
          status: e.status,
          created_at: e.created_at,
          description: e.description,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t('welcome')}</p>
            <h1 className="text-xl font-bold">{staffData.full_name.split(' ')[0]}</h1>
          </div>
          <LanguageToggle />
        </div>
      </div>

      <div className="p-4 space-y-4 pb-8">
        {/* Attendance widget */}
        <AttendanceWidget />

        {/* My pending leave balance */}
        <MyLeaveBalanceCard staffId={staffData?.id} />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Salary Card - Hidden by default */}
          <Card className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <button
                  onClick={() => setShowSalary(!showSalary)}
                  className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                >
                  {showSalary ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
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
                {showSalary ? '' : t('tap_to_view')}
              </p>
            </CardContent>
          </Card>

          {/* Advance Outstanding Card - Data from journal_lines (single source of truth) */}
          <Card className="relative overflow-hidden">
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

        {/* Big Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={() => setShowAdvanceForm(true)}
            className="w-full h-16 text-lg font-semibold bg-primary hover:bg-primary/90 shadow-lg"
            size="lg"
          >
            <Wallet className="mr-3 h-6 w-6" />
            💰 {t('request_advance')}
          </Button>

          <Button
            onClick={() => navigate('/expenses/new')}
            variant="secondary"
            className="w-full h-16 text-lg font-semibold shadow-lg"
            size="lg"
          >
            <Receipt className="mr-3 h-6 w-6" />
            🧾 {t('request_expense')}
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
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          item.type === 'advance' ? 'bg-primary/10' : 'bg-secondary'
                        }`}>
                          {item.type === 'advance' ? (
                            <Wallet className="h-5 w-5 text-primary" />
                          ) : (
                            <Receipt className="h-5 w-5 text-secondary-foreground" />
                          )}
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
    </div>
  );
}
