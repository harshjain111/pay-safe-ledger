import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Amount } from '@/components/ui/amount';
import { Badge } from '@/components/ui/badge';
import { Sparkles, AlertTriangle, TrendingUp, TrendingDown, Minus, Lightbulb, BarChart3, Loader2 } from 'lucide-react';
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { toast } from '@/hooks/use-toast';

type DatePreset = 'last30' | 'last3Months' | 'last6Months' | 'thisMonth';

const COLORS = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const CATEGORY_LABELS: Record<string, string> = {
  travel: 'Travel', food: 'Food & Meals', logistics: 'Logistics', equipment: 'Equipment',
  office_supplies: 'Office Supplies', communication: 'Communication', other: 'Other',
};

export function AIInsights() {
  const [datePreset, setDatePreset] = useState<DatePreset>('last3Months');
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const getDateRange = () => {
    const now = new Date();
    switch (datePreset) {
      case 'last30': return { from: subDays(now, 30), to: now };
      case 'last3Months': return { from: subMonths(now, 3), to: now };
      case 'last6Months': return { from: subMonths(now, 6), to: now };
      case 'thisMonth': return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  };

  const generateInsights = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const range = getDateRange();
      const { data, error: fnError } = await supabase.functions.invoke('ai-insights', {
        body: {
          dateFrom: format(range.from, 'yyyy-MM-dd'),
          dateTo: format(range.to, 'yyyy-MM-dd'),
        },
      });

      if (fnError) throw fnError;
      if (data?.error) {
        setError(data.error);
        toast({ title: 'AI Analysis Error', description: data.error, variant: 'destructive' });
        return;
      }
      setInsights(data);
    } catch (err) {
      console.error('Error generating insights:', err);
      setError('Failed to generate AI insights. Please try again.');
      toast({ title: 'Error', description: 'Failed to generate insights.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'high') return 'destructive';
    if (severity === 'medium') return 'outline';
    return 'secondary';
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Analysis Period</Label>
              <Select value={datePreset} onValueChange={v => setDatePreset(v as DatePreset)}>
                <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="last30">Last 30 Days</SelectItem>
                  <SelectItem value="last3Months">Last 3 Months</SelectItem>
                  <SelectItem value="last6Months">Last 6 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateInsights} disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isLoading ? 'Analyzing...' : 'Generate AI Analysis'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!insights && !isLoading && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">AI-Powered Financial Insights</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Click "Generate AI Analysis" to get intelligent insights about your expenses, identify leakages, cost optimization opportunities, and spending trends.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {insights && (
        <>
          {/* Executive Summary */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{insights.summary}</p>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          {insights.keyMetrics?.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {insights.keyMetrics.map((m: any, i: number) => (
                <Card key={i}>
                  <CardHeader className="pb-2 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      {getTrendIcon(m.trend)}
                    </div>
                    <p className="text-lg font-bold">{m.value}</p>
                    {m.insight && <p className="text-xs text-muted-foreground mt-1">{m.insight}</p>}
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}

          {/* Charts */}
          {insights.chartData && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Category Pie */}
              {insights.chartData.categoryBreakdown?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Expense Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={insights.chartData.categoryBreakdown.map((c: any) => ({ ...c, name: CATEGORY_LABELS[c.name] || c.name }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {insights.chartData.categoryBreakdown.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Monthly Trend */}
              {insights.chartData.monthlyTrend?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Monthly Expense Trend</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={insights.chartData.monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                        <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Staff Spend */}
              {insights.chartData.staffSpend?.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader><CardTitle className="text-base">Staff-wise Spend Comparison</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={insights.chartData.staffSpend}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                        <Bar dataKey="expenses" fill="hsl(var(--primary))" name="Expenses" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="advances" fill="#f59e0b" name="Advances" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Alerts */}
          {insights.alerts?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Alerts & Anomalies</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {insights.alerts.map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                    <Badge variant={getSeverityColor(a.severity) as any} className="mt-0.5 shrink-0">{a.severity}</Badge>
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {insights.recommendations?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4" />Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {insights.recommendations.map((r: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="mt-0.5 shrink-0">{r.impact} impact</Badge>
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Detailed Analysis */}
          <div className="grid md:grid-cols-2 gap-4">
            {insights.categoryInsights && (
              <Card>
                <CardHeader><CardTitle className="text-base">Category Analysis</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-relaxed">{insights.categoryInsights}</p></CardContent>
              </Card>
            )}
            {insights.staffInsights && (
              <Card>
                <CardHeader><CardTitle className="text-base">Staff Analysis</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-relaxed">{insights.staffInsights}</p></CardContent>
              </Card>
            )}
            {insights.trendAnalysis && (
              <Card className="md:col-span-2">
                <CardHeader><CardTitle className="text-base">Trend Analysis & Forecast</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-relaxed">{insights.trendAnalysis}</p></CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
