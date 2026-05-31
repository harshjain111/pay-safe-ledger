import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Amount } from '@/components/ui/amount';
import {
  FileText,
  Users,
  Download,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import type { SalarySettlement } from '@/types/database';

export function CADashboard() {
  const [stats, setStats] = useState({
    totalStaff: 0,
    monthlyPayroll: 0,
    settledThisMonth: 0,
    pendingSettlements: 0,
  });
  const [recentSettlements, setRecentSettlements] = useState<SalarySettlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const currentMonth = format(new Date(), 'yyyy-MM');

      // Fetch settlements for current month
      const { data: settlements, error: settlementsError } = await supabase
        .from('salary_settlements')
        .select('*')
        .eq('settlement_month', currentMonth);

      if (settlementsError) throw settlementsError;

      const settled = (settlements || []).filter(s => s.status === 'settled');
      const pending = (settlements || []).filter(s => s.status === 'pending');

      // Get recent settlements
      const { data: recentData, error: recentError } = await supabase
        .from('salary_settlements')
        .select('*')
        .eq('status', 'settled')
        .order('settled_at', { ascending: false })
        .limit(10);

      if (recentError) throw recentError;

      setStats({
        totalStaff: 0,
        monthlyPayroll: settled.reduce((sum, s) => sum + Number(s.net_salary), 0),
        settledThisMonth: settled.length,
        pendingSettlements: pending.length,
      });

      setRecentSettlements(recentData as SalarySettlement[] || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const currentMonth = format(new Date(), 'MMMM yyyy');

  return (
    <div className="space-y-8">
      <PageHeader
        title="Auditor Dashboard"
        description="Read-only access to payroll reports"
      >
        <Link to="/reports">
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Export Reports
          </Button>
        </Link>
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Settled This Month"
          value={stats.settledThisMonth}
          subtitle={currentMonth}
          icon={FileText}
          variant="success"
        />
        <StatCard
          title="Total Disbursed"
          value={`₹${stats.monthlyPayroll.toLocaleString('en-IN')}`}
          subtitle="This month"
          icon={BarChart3}
        />
        <StatCard
          title="Pending Settlements"
          value={stats.pendingSettlements}
          subtitle="Not yet settled"
          icon={Users}
        />
      </div>

      {/* Report Links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Reports</CardTitle>
          <CardDescription>Download and view payroll reports</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Link to="/reports?type=salary-register">
            <Button variant="outline" className="w-full justify-start h-auto py-4">
              <FileText className="mr-3 h-5 w-5 text-primary" />
              <div className="text-left">
                <p className="font-medium">Salary Register</p>
                <p className="text-xs text-muted-foreground">Monthly salary breakdown</p>
              </div>
            </Button>
          </Link>
          <Link to="/reports?type=payment-register">
            <Button variant="outline" className="w-full justify-start h-auto py-4">
              <BarChart3 className="mr-3 h-5 w-5 text-success" />
              <div className="text-left">
                <p className="font-medium">Payment Register</p>
                <p className="text-xs text-muted-foreground">All payment transactions</p>
              </div>
            </Button>
          </Link>
          <Link to="/reports?type=advance-register">
            <Button variant="outline" className="w-full justify-start h-auto py-4">
              <FileText className="mr-3 h-5 w-5 text-warning" />
              <div className="text-left">
                <p className="font-medium">Advance Register</p>
                <p className="text-xs text-muted-foreground">Staff-wise advances</p>
              </div>
            </Button>
          </Link>
          <Link to="/reports?type=payroll-summary">
            <Button variant="outline" className="w-full justify-start h-auto py-4">
              <Users className="mr-3 h-5 w-5 text-info" />
              <div className="text-left">
                <p className="font-medium">Payroll Summary</p>
                <p className="text-xs text-muted-foreground">Monthly consolidated view</p>
              </div>
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Settlements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Recent Settlements</CardTitle>
            <CardDescription>Latest salary settlements</CardDescription>
          </div>
          <Link to="/reports?type=salary-register">
            <Button variant="ghost" size="sm">
              View all
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentSettlements.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No settlements yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-ledger">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Base Salary</th>
                    <th>Deductions</th>
                    <th>Net Salary</th>
                    <th>Settled On</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSettlements.map((settlement) => (
                    <tr key={settlement.id}>
                      <td>{settlement.settlement_month}</td>
                      <td>
                        <Amount value={settlement.base_salary} />
                      </td>
                      <td>
                        <Amount value={-settlement.leave_deduction} />
                      </td>
                      <td>
                        <Amount value={settlement.net_salary} />
                      </td>
                      <td>
                        {settlement.settled_at
                          ? format(new Date(settlement.settled_at), 'dd MMM yyyy')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
