import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, TrendingDown, TrendingUp, Wallet, Receipt, Clock } from 'lucide-react';
import type { Staff, Expense } from '@/types/database';

interface StaffFinancials {
  monthlySalary: number;
  advancesOutstanding: number;
  currentBalance: number;
  pendingExpenses: number;
  approvedExpensesTotal: number;
}

interface StaffFinancialSummaryProps {
  staff: Staff | null;
  financials: StaffFinancials | null;
  approvedExpenses?: Expense[];
  isLoading?: boolean;
}

export function StaffFinancialSummary({
  staff,
  financials,
  approvedExpenses = [],
  isLoading = false,
}: StaffFinancialSummaryProps) {
  if (!staff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff Summary</CardTitle>
          <CardDescription>Select a staff member</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Select a staff member to see their financial summary
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff Summary</CardTitle>
          <CardDescription>{staff.full_name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{staff.full_name}</CardTitle>
            <CardDescription>{staff.employee_id}</CardDescription>
          </div>
          <Badge variant={staff.is_active ? 'default' : 'secondary'}>
            {staff.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Monthly Salary */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Monthly Salary</p>
            <Amount 
              value={financials?.monthlySalary || staff.monthly_salary} 
              size="md" 
              className="text-foreground font-semibold"
            />
          </div>
        </div>

        {/* Advances Outstanding */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/10">
          <div className="p-2 rounded-lg bg-warning/10">
            <TrendingUp className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Advances Outstanding</p>
            <Amount 
              value={financials?.advancesOutstanding || 0} 
              size="md" 
              className={financials?.advancesOutstanding ? 'text-warning font-semibold' : 'text-foreground font-semibold'}
            />
          </div>
        </div>

        {/* Current Balance */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border">
          <div className="p-2 rounded-lg bg-secondary">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Ledger Balance</p>
            <Amount 
              value={financials?.currentBalance || 0} 
              size="md" 
              showSign
              className="font-semibold"
            />
          </div>
        </div>

        {/* Approved Expenses (if any) */}
        {approvedExpenses.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-success/5 border border-success/10">
            <div className="p-2 rounded-lg bg-success/10">
              <Receipt className="h-4 w-4 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">
                Approved Expenses ({approvedExpenses.length})
              </p>
              <Amount 
                value={financials?.approvedExpensesTotal || 0} 
                size="md" 
                className="text-success font-semibold"
              />
            </div>
          </div>
        )}

        {/* Pending Expenses */}
        {(financials?.pendingExpenses || 0) > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
            <div className="p-2 rounded-lg bg-muted">
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Pending Expenses</p>
              <Amount 
                value={financials.pendingExpenses} 
                size="md" 
                className="text-muted-foreground font-semibold"
              />
            </div>
          </div>
        )}

        {/* Warning */}
        {(financials?.advancesOutstanding || 0) > 0 && (
          <div className="flex items-start gap-2 p-3 bg-info/10 rounded-lg text-xs border border-info/20">
            <AlertCircle className="h-4 w-4 text-info mt-0.5 shrink-0" />
            <p className="text-info">
              Advances will be adjusted during salary settlement
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
