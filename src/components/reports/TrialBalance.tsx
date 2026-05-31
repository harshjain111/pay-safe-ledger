/**
 * Trial Balance Component
 * 
 * CA-ready report showing total debits = total credits
 * Single source of truth: All balances derived from journal_lines
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Amount } from '@/components/ui/amount';
import { Loader2, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

export function TrialBalance() {
  const [data, setData] = useState<TrialBalanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrialBalance();
  }, []);

  const fetchTrialBalance = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: trialData, error: fetchError } = await supabase
        .rpc('get_trial_balance');

      if (fetchError) throw fetchError;
      
      setData((trialData || []) as unknown as TrialBalanceRow[]);
    } catch (err: any) {
      console.error('Error fetching trial balance:', err);
      setError(err.message || 'Failed to fetch trial balance');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate totals
  const totalDebits = data.reduce((sum, row) => sum + Number(row.total_debit), 0);
  const totalCredits = data.reduce((sum, row) => sum + Number(row.total_credit), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
  const difference = Math.abs(totalDebits - totalCredits);

  const getAccountTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      asset: 'default',
      liability: 'secondary',
      equity: 'outline',
      income: 'default',
      expense: 'destructive',
    };
    return variants[type] || 'outline';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Trial Balance
            </CardTitle>
            <CardDescription>
              Double-entry verification report • All balances from journal entries
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isBalanced ? (
              <Badge variant="default" className="bg-primary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Balanced
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Unbalanced (₹{difference.toFixed(2)})
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!isBalanced && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Critical:</strong> Total debits do not equal total credits. 
              Difference: ₹{difference.toFixed(2)}. This indicates an accounting error that must be investigated.
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="text-right w-32">Debit</TableHead>
                <TableHead className="text-right w-32">Credit</TableHead>
                <TableHead className="text-right w-32">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No journal entries found. Start recording transactions to see the trial balance.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.account_code}>
                    <TableCell className="font-mono text-sm">{row.account_code}</TableCell>
                    <TableCell>{row.account_name}</TableCell>
                    <TableCell>
                      <Badge variant={getAccountTypeBadge(row.account_type)} className="capitalize text-xs">
                        {row.account_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(row.total_debit) > 0 ? <Amount value={row.total_debit} /> : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(row.total_credit) > 0 ? <Amount value={row.total_credit} /> : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${Number(row.balance) < 0 ? 'text-red-600' : ''}`}>
                      <Amount value={Math.abs(row.balance)} />
                      {Number(row.balance) < 0 && ' Cr'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {data.length > 0 && (
              <TableFooter>
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">
                    <Amount value={totalDebits} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={totalCredits} />
                  </TableCell>
                  <TableCell className={`text-right ${!isBalanced ? 'text-destructive' : 'text-green-600'}`}>
                    {isBalanced ? (
                      <span className="flex items-center justify-end gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Balanced
                      </span>
                    ) : (
                      <span>Diff: ₹{difference.toFixed(2)}</span>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          <p><strong>Note:</strong> This report derives all balances exclusively from the journal_lines table (double-entry system).</p>
          <p className="mt-1">Legacy single-entry records are excluded from this calculation.</p>
        </div>
      </CardContent>
    </Card>
  );
}
