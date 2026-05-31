import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { dateFrom, dateTo } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch financial data for analysis
    const [expensesRes, advancesRes, settlementsRes, staffRes] = await Promise.all([
      supabase.from('expenses').select('amount, category, expense_date, status, staff_id, staff:staff_public(full_name)')
        .in('status', ['approved', 'reimbursed'])
        .gte('expense_date', dateFrom).lte('expense_date', dateTo),
      supabase.from('payment_requests').select('amount, status, created_at, staff_id, staff:staff_public(full_name)')
        .eq('payout_type', 'advance')
        .gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59'),
      supabase.from('salary_settlements').select('base_salary, net_salary, leave_deduction, advances_adjusted, balance_payable, settlement_month, staff_id, staff:staff_public(full_name)')
        .gte('settlement_month', dateFrom.substring(0, 7)).lte('settlement_month', dateTo.substring(0, 7)),
      supabase.from('staff').select('id, full_name, monthly_salary, is_active').eq('is_active', true),
    ]);

    const expenses = expensesRes.data || [];
    const advances = advancesRes.data || [];
    const settlements = settlementsRes.data || [];
    const staffList = staffRes.data || [];

    // Build a comprehensive data summary for AI
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalAdvances = advances.filter(a => a.status === 'approved').reduce((s, a) => s + Number(a.amount), 0);
    const totalSalaries = settlements.reduce((s, s2) => s + Number(s2.balance_payable), 0);
    
    // Category breakdown
    const catBreakdown: Record<string, number> = {};
    expenses.forEach(e => {
      catBreakdown[e.category] = (catBreakdown[e.category] || 0) + Number(e.amount);
    });

    // Staff spending
    const staffSpend: Record<string, { name: string; expenses: number; advances: number }> = {};
    expenses.forEach(e => {
      if (!staffSpend[e.staff_id]) staffSpend[e.staff_id] = { name: (e.staff as any)?.full_name || 'Unknown', expenses: 0, advances: 0 };
      staffSpend[e.staff_id].expenses += Number(e.amount);
    });
    advances.filter(a => a.status === 'approved').forEach(a => {
      if (!staffSpend[a.staff_id]) staffSpend[a.staff_id] = { name: (a.staff as any)?.full_name || 'Unknown', expenses: 0, advances: 0 };
      staffSpend[a.staff_id].advances += Number(a.amount);
    });

    // Monthly trend
    const monthlyExpenses: Record<string, number> = {};
    expenses.forEach(e => {
      const month = e.expense_date.substring(0, 7);
      monthlyExpenses[month] = (monthlyExpenses[month] || 0) + Number(e.amount);
    });

    const dataSummary = `
Financial Data Summary (${dateFrom} to ${dateTo}):

OVERVIEW:
- Total Expenses: ₹${totalExpenses.toLocaleString('en-IN')}
- Total Advances Paid: ₹${totalAdvances.toLocaleString('en-IN')}
- Total Salaries Settled: ₹${totalSalaries.toLocaleString('en-IN')}
- Active Staff: ${staffList.length}
- Total Cash Outflow: ₹${(totalExpenses + totalAdvances + totalSalaries).toLocaleString('en-IN')}

EXPENSE BREAKDOWN BY CATEGORY:
${Object.entries(catBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `- ${cat}: ₹${amt.toLocaleString('en-IN')} (${totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(1) : 0}%)`).join('\n')}

MONTHLY EXPENSE TREND:
${Object.entries(monthlyExpenses).sort().map(([m, a]) => `- ${m}: ₹${a.toLocaleString('en-IN')}`).join('\n')}

STAFF-WISE SPENDING (Top contributors):
${Object.values(staffSpend).sort((a, b) => (b.expenses + b.advances) - (a.expenses + a.advances)).slice(0, 10).map(s => `- ${s.name}: Expenses ₹${s.expenses.toLocaleString('en-IN')}, Advances ₹${s.advances.toLocaleString('en-IN')}`).join('\n')}

SALARY DATA:
- Total Monthly Payroll (active staff): ₹${staffList.reduce((s, st) => s + Number(st.monthly_salary), 0).toLocaleString('en-IN')}
- Leave Deductions Total: ₹${settlements.reduce((s, s2) => s + Number(s2.leave_deduction || 0), 0).toLocaleString('en-IN')}
- Advances Adjusted from Salary: ₹${settlements.reduce((s, s2) => s + Number(s2.advances_adjusted || 0), 0).toLocaleString('en-IN')}
`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a financial analyst for a business. Analyze the provided financial data and generate actionable insights. Your response MUST be valid JSON with this structure:
{
  "summary": "2-3 sentence executive summary",
  "keyMetrics": [{"label": "string", "value": "string", "trend": "up|down|neutral", "insight": "string"}],
  "alerts": [{"severity": "high|medium|low", "title": "string", "description": "string"}],
  "recommendations": [{"title": "string", "description": "string", "impact": "high|medium|low"}],
  "categoryInsights": "paragraph about category spending patterns",
  "staffInsights": "paragraph about staff spending patterns",
  "trendAnalysis": "paragraph about monthly trends and projections"
}
Be specific with numbers. Flag expense spikes, unusual patterns, cost optimization opportunities, and potential leakages. Use ₹ for currency.`
          },
          { role: "user", content: dataSummary }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    // Parse JSON from AI response (handle markdown code blocks)
    let insights;
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      insights = JSON.parse(jsonStr);
    } catch {
      insights = { summary: content, keyMetrics: [], alerts: [], recommendations: [], categoryInsights: '', staffInsights: '', trendAnalysis: '' };
    }

    // Add raw data for charts
    insights.chartData = {
      categoryBreakdown: Object.entries(catBreakdown).map(([name, value]) => ({ name, value })),
      monthlyTrend: Object.entries(monthlyExpenses).sort().map(([month, amount]) => ({ month, amount })),
      staffSpend: Object.values(staffSpend).sort((a, b) => (b.expenses + b.advances) - (a.expenses + a.advances)).slice(0, 8),
    };
    insights.totals = { totalExpenses, totalAdvances, totalSalaries, staffCount: staffList.length };

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
