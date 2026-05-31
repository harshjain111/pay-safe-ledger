import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    const OWNER_CHAT_ID = Deno.env.get('TELEGRAM_OWNER_CHAT_ID');
    
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !OWNER_CHAT_ID) {
      throw new Error('Missing required environment variables');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const reportType = body.report_type || 'daily';

    // IST offset
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().split('T')[0];

    let message = '';

    if (reportType === 'daily') {
      message = await generateDailyReport(supabase, todayIST, istNow);
    } else if (reportType === 'weekly') {
      message = await generateWeeklySummary(supabase, istNow);
    } else if (reportType === 'monthly') {
      message = await generateMonthlySummary(supabase, istNow);
    }

    // Send via Telegram
    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: OWNER_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await response.json();

    return new Response(
      JSON.stringify({ success: response.ok, message_id: data.result?.message_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Report error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ─── Helpers ───

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  return `₹${Math.abs(n).toLocaleString('en-IN')}`;
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Daily Report ───

async function generateDailyReport(supabase: any, todayIST: string, istNow: Date): Promise<string> {
  const dayStart = `${todayIST}T00:00:00+05:30`;
  const dayEnd = `${todayIST}T23:59:59+05:30`;

  // Parallel fetches
  const [
    journalResult,
    expensesResult,
    advancesResult,
    settlementsResult,
    leaveResult,
    staffResult,
  ] = await Promise.all([
    // All journal entries today (cash-out register)
    supabase
      .from('journal_entries')
      .select('id, reference_no, description, transaction_type, entry_date, created_at, staff_id, paid_by_user_name, staff:staff_id(full_name)')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: true }),
    
    // Expenses submitted/approved/reimbursed today
    supabase
      .from('expenses')
      .select('id, amount, status, category, description, staff:staff_id(full_name)')
      .gte('updated_at', dayStart)
      .lte('updated_at', dayEnd),
    
    // Advances (payment requests) today
    supabase
      .from('payment_requests')
      .select('id, amount, status, reason, staff:staff_id(full_name)')
      .gte('updated_at', dayStart)
      .lte('updated_at', dayEnd),
    
    // Settlements created/paid today
    supabase
      .from('salary_settlements')
      .select('id, base_salary, net_salary, balance_payable, advances_adjusted, leave_deduction, status, staff:staff_id(full_name)')
      .gte('updated_at', dayStart)
      .lte('updated_at', dayEnd),
    
    // Leave records today
    supabase
      .from('leave_records')
      .select('id, leave_type, deduction_days, status, staff:staff_id(full_name)')
      .gte('updated_at', dayStart)
      .lte('updated_at', dayEnd),
    
    // Active staff count
    supabase.from('staff').select('id').eq('is_active', true),
  ]);

  // Get journal lines for amount info
  const journalIds = (journalResult.data || []).map((j: any) => j.id);
  let journalLines: any[] = [];
  if (journalIds.length > 0) {
    const { data } = await supabase
      .from('journal_lines')
      .select('journal_entry_id, debit, credit, account_id, description')
      .in('journal_entry_id', journalIds);
    journalLines = data || [];
  }

  // Get accounts for category mapping
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name');
  const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]));

  const journals = journalResult.data || [];
  const expenses = expensesResult.data || [];
  const advances = advancesResult.data || [];
  const settlements = settlementsResult.data || [];
  const leaves = leaveResult.data || [];
  const activeStaff = (staffResult.data || []).length;

  // ── SECTION 1: CASH-OUT REGISTER ──
  let cashOutLines: string[] = [];
  let totalCashOut = 0;
  let txnNo = 0;

  for (const je of journals) {
    const lines = journalLines.filter((jl: any) => jl.journal_entry_id === je.id);
    // Cash out = credit side of Cash/Bank accounts (codes 1000, 1001, 1050) 
    // OR debit side of expense/salary accounts
    const cashLines = lines.filter((l: any) => {
      const acc = accountMap.get(l.account_id);
      return acc && ['1000', '1001', '1050'].includes(acc.code) && l.credit > 0;
    });
    
    for (const cl of cashLines) {
      txnNo++;
      const acc = accountMap.get(cl.account_id);
      const amount = cl.credit;
      totalCashOut += amount;
      const staffName = je.staff?.full_name || '-';
      const time = new Date(je.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
      
      cashOutLines.push(
        `${txnNo}. ${esc(staffName)} | ${fmt(amount)} | ${esc(je.transaction_type.replace(/_/g, ' '))} | ${je.reference_no} | ${time}`
      );
    }
  }

  // ── SECTION 2: EXPENSE CATEGORY BREAKDOWN ──
  const categoryTotals = new Map<string, number>();
  for (const exp of expenses) {
    if (exp.status === 'rejected') continue;
    const cat = (exp.category || 'other').replace(/_/g, ' ');
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + Number(exp.amount));
  }
  const totalExpCat = Array.from(categoryTotals.values()).reduce((s, v) => s + v, 0);

  // ── SECTION 3: DAILY SUMMARY ──
  const pendingExp = expenses.filter((e: any) => e.status === 'pending');
  const approvedExp = expenses.filter((e: any) => e.status === 'approved');
  const reimbursedExp = expenses.filter((e: any) => e.status === 'reimbursed');
  const rejectedExp = expenses.filter((e: any) => e.status === 'rejected');

  const pendingAdv = advances.filter((a: any) => a.status === 'pending');
  const approvedAdv = advances.filter((a: any) => a.status === 'approved');
  const paidAdv = advances.filter((a: any) => a.paid_at != null || a.status === 'approved');

  const pendingLeave = leaves.filter((l: any) => l.status === 'pending');
  const approvedLeave = leaves.filter((l: any) => l.status === 'approved');

  const settledSalaries = settlements.filter((s: any) => s.status === 'settled');
  const pendingSalaries = settlements.filter((s: any) => s.status === 'pending');

  // Build message
  let msg = `📊 <b>SMOKZY DAILY REPORT</b>\n`;
  msg += `📅 ${dateLabel(istNow)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Cash-out register
  msg += `💸 <b>CASH-OUT REGISTER</b>\n`;
  if (cashOutLines.length === 0) {
    msg += `No cash outflows today.\n`;
  } else {
    msg += cashOutLines.join('\n') + '\n';
    msg += `\n<b>Total Cash Out: ${fmt(totalCashOut)}</b>\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Expense category breakdown
  msg += `📂 <b>EXPENSE CATEGORY BREAKDOWN</b>\n`;
  if (categoryTotals.size === 0) {
    msg += `No expenses today.\n`;
  } else {
    let catNo = 0;
    for (const [cat, amt] of categoryTotals.entries()) {
      catNo++;
      const pct = totalExpCat > 0 ? ((amt / totalExpCat) * 100).toFixed(1) : '0.0';
      msg += `${catNo}. ${esc(cat)} — ${fmt(amt)} (${pct}%)\n`;
    }
    msg += `<b>Total: ${fmt(totalExpCat)}</b>\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Daily summary
  msg += `📋 <b>DAILY SUMMARY</b>\n\n`;

  msg += `👥 Active Staff: ${activeStaff}\n\n`;

  msg += `<b>Expenses:</b>\n`;
  msg += `  🟡 Pending: ${pendingExp.length} (${fmt(pendingExp.reduce((s: number, e: any) => s + Number(e.amount), 0))})\n`;
  msg += `  🟢 Approved: ${approvedExp.length} (${fmt(approvedExp.reduce((s: number, e: any) => s + Number(e.amount), 0))})\n`;
  msg += `  ✅ Reimbursed: ${reimbursedExp.length} (${fmt(reimbursedExp.reduce((s: number, e: any) => s + Number(e.amount), 0))})\n`;
  msg += `  🔴 Rejected: ${rejectedExp.length}\n\n`;

  msg += `<b>Advances:</b>\n`;
  msg += `  🟡 Pending: ${pendingAdv.length} (${fmt(pendingAdv.reduce((s: number, a: any) => s + Number(a.amount), 0))})\n`;
  msg += `  🟢 Approved/Paid: ${approvedAdv.length} (${fmt(approvedAdv.reduce((s: number, a: any) => s + Number(a.amount), 0))})\n\n`;

  msg += `<b>Salary Settlements:</b>\n`;
  msg += `  🟡 Pending: ${pendingSalaries.length} (${fmt(pendingSalaries.reduce((s: number, x: any) => s + Number(x.balance_payable), 0))})\n`;
  msg += `  ✅ Settled: ${settledSalaries.length} (${fmt(settledSalaries.reduce((s: number, x: any) => s + Number(x.balance_payable), 0))})\n\n`;

  msg += `<b>Leave Records:</b>\n`;
  msg += `  🟡 Pending: ${pendingLeave.length}\n`;
  msg += `  🟢 Approved: ${approvedLeave.length} (${approvedLeave.reduce((s: number, l: any) => s + Number(l.deduction_days), 0)} days)\n\n`;

  msg += `📊 Total Transactions: ${journals.length}\n`;
  msg += `\n<i>Generated at 11:00 PM IST</i>`;

  return msg;
}

// ─── Weekly Summary ───

async function generateWeeklySummary(supabase: any, istNow: Date): Promise<string> {
  // Last 7 days
  const weekAgo = new Date(istNow.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromDate = weekAgo.toISOString().split('T')[0];
  const toDate = istNow.toISOString().split('T')[0];
  const from = `${fromDate}T00:00:00+05:30`;
  const to = `${toDate}T23:59:59+05:30`;

  const [expenses, advances, settlements, leaves, journals, staff] = await Promise.all([
    supabase.from('expenses').select('id, amount, status, category').gte('updated_at', from).lte('updated_at', to),
    supabase.from('payment_requests').select('id, amount, status').gte('updated_at', from).lte('updated_at', to),
    supabase.from('salary_settlements').select('id, balance_payable, net_salary, advances_adjusted, leave_deduction, status').gte('updated_at', from).lte('updated_at', to),
    supabase.from('leave_records').select('id, deduction_days, status, leave_type').gte('updated_at', from).lte('updated_at', to),
    supabase.from('journal_entries').select('id').gte('created_at', from).lte('created_at', to),
    supabase.from('staff').select('id').eq('is_active', true),
  ]);

  // Get cash outflow from journal lines
  const journalIds = (journals.data || []).map((j: any) => j.id);
  let totalCashOut = 0;
  if (journalIds.length > 0) {
    const { data: accounts } = await supabase.from('accounts').select('id, code').in('code', ['1000', '1001', '1050']);
    const cashAccountIds = (accounts || []).map((a: any) => a.id);
    
    if (cashAccountIds.length > 0) {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('credit')
        .in('journal_entry_id', journalIds)
        .in('account_id', cashAccountIds)
        .gt('credit', 0);
      totalCashOut = (lines || []).reduce((s: number, l: any) => s + Number(l.credit), 0);
    }
  }

  const exp = expenses.data || [];
  const adv = advances.data || [];
  const sett = settlements.data || [];
  const lv = leaves.data || [];

  const totalExpApproved = exp.filter((e: any) => ['approved', 'reimbursed'].includes(e.status)).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const totalAdvPaid = adv.filter((a: any) => a.status === 'approved').reduce((s: number, a: any) => s + Number(a.amount), 0);
  const totalSalaryPaid = sett.filter((s: any) => s.status === 'settled').reduce((s: number, x: any) => s + Number(x.balance_payable), 0);
  const totalLeaveDeductions = lv.filter((l: any) => l.status === 'approved').reduce((s: number, l: any) => s + Number(l.deduction_days), 0);

  // Category breakdown for the week
  const catMap = new Map<string, number>();
  exp.filter((e: any) => e.status !== 'rejected').forEach((e: any) => {
    const cat = (e.category || 'other').replace(/_/g, ' ');
    catMap.set(cat, (catMap.get(cat) || 0) + Number(e.amount));
  });

  let msg = `📈 <b>SMOKZY WEEKLY SUMMARY</b>\n`;
  msg += `📅 ${fromDate} → ${toDate}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `<b>💰 KEY METRICS</b>\n`;
  msg += `Total Cash Outflow: <b>${fmt(totalCashOut)}</b>\n`;
  msg += `Expenses Approved: <b>${fmt(totalExpApproved)}</b>\n`;
  msg += `Advances Paid: <b>${fmt(totalAdvPaid)}</b>\n`;
  msg += `Salary Paid: <b>${fmt(totalSalaryPaid)}</b>\n`;
  msg += `Total Transactions: <b>${(journals.data || []).length}</b>\n`;
  msg += `Active Staff: <b>${(staff.data || []).length}</b>\n\n`;

  msg += `<b>📊 ACTIVITY</b>\n`;
  msg += `Expenses: ${exp.length} (${exp.filter((e: any) => e.status === 'pending').length} pending)\n`;
  msg += `Advances: ${adv.length} (${adv.filter((a: any) => a.status === 'pending').length} pending)\n`;
  msg += `Settlements: ${sett.length}\n`;
  msg += `Leave Records: ${lv.length} (${totalLeaveDeductions} deduction days)\n\n`;

  if (catMap.size > 0) {
    msg += `<b>📂 EXPENSE CATEGORIES</b>\n`;
    const totalCat = Array.from(catMap.values()).reduce((s, v) => s + v, 0);
    for (const [cat, amt] of [...catMap.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = totalCat > 0 ? ((amt / totalCat) * 100).toFixed(1) : '0.0';
      msg += `• ${esc(cat)}: ${fmt(amt)} (${pct}%)\n`;
    }
    msg += '\n';
  }

  msg += `<i>Weekly report — Monday 6:00 PM IST</i>`;
  return msg;
}

// ─── Monthly Summary ───

async function generateMonthlySummary(supabase: any, istNow: Date): Promise<string> {
  const year = istNow.getFullYear();
  const month = istNow.getMonth(); // 0-indexed
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  const firstDay = `${monthStr}-01`;
  const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const from = `${firstDay}T00:00:00+05:30`;
  const to = `${lastDay}T23:59:59+05:30`;

  const [expenses, advances, settlements, leaves, journals, staff, advAccounts] = await Promise.all([
    supabase.from('expenses').select('id, amount, status, category').gte('created_at', from).lte('created_at', to),
    supabase.from('payment_requests').select('id, amount, status').gte('created_at', from).lte('created_at', to),
    supabase.from('salary_settlements').select('id, base_salary, net_salary, balance_payable, advances_adjusted, leave_deduction, status').eq('settlement_month', monthStr),
    supabase.from('leave_records').select('id, deduction_days, status, leave_type').gte('leave_date', firstDay).lte('leave_date', lastDay),
    supabase.from('journal_entries').select('id').gte('created_at', from).lte('created_at', to),
    supabase.from('staff').select('id, monthly_salary').eq('is_active', true),
    // Advances outstanding
    supabase.from('accounts').select('id').eq('code', '1200'),
  ]);

  // Get total cash outflow
  const journalIds = (journals.data || []).map((j: any) => j.id);
  let totalCashOut = 0;
  if (journalIds.length > 0) {
    const { data: cashAccounts } = await supabase.from('accounts').select('id').in('code', ['1000', '1001', '1050']);
    const cashIds = (cashAccounts || []).map((a: any) => a.id);
    if (cashIds.length > 0) {
      const { data: lines } = await supabase.from('journal_lines').select('credit').in('journal_entry_id', journalIds).in('account_id', cashIds).gt('credit', 0);
      totalCashOut = (lines || []).reduce((s: number, l: any) => s + Number(l.credit), 0);
    }
  }

  // Advances outstanding (all time)
  let advOutstanding = 0;
  const advAccountId = (advAccounts.data || [])[0]?.id;
  if (advAccountId) {
    const { data: advLines } = await supabase.from('journal_lines').select('debit, credit').eq('account_id', advAccountId);
    const totalD = (advLines || []).reduce((s: number, l: any) => s + Number(l.debit), 0);
    const totalC = (advLines || []).reduce((s: number, l: any) => s + Number(l.credit), 0);
    advOutstanding = totalD - totalC;
  }

  const exp = expenses.data || [];
  const adv = advances.data || [];
  const sett = settlements.data || [];
  const lv = leaves.data || [];
  const staffData = staff.data || [];

  const totalPayroll = staffData.reduce((s: number, st: any) => s + Number(st.monthly_salary || 0), 0);
  const totalExpApproved = exp.filter((e: any) => ['approved', 'reimbursed'].includes(e.status)).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const totalAdvPaid = adv.filter((a: any) => a.status === 'approved').reduce((s: number, a: any) => s + Number(a.amount), 0);
  const totalSalaryPaid = sett.filter((s: any) => s.status === 'settled').reduce((s: number, x: any) => s + Number(x.balance_payable), 0);
  const totalLeaveDeductions = lv.filter((l: any) => l.status === 'approved').reduce((s: number, l: any) => s + Number(l.deduction_days), 0);
  const totalLeaveDeductionAmt = sett.reduce((s: number, x: any) => s + Number(x.leave_deduction || 0), 0);
  const totalAdvancesAdj = sett.reduce((s: number, x: any) => s + Number(x.advances_adjusted || 0), 0);

  // Category breakdown
  const catMap = new Map<string, number>();
  exp.filter((e: any) => e.status !== 'rejected').forEach((e: any) => {
    const cat = (e.category || 'other').replace(/_/g, ' ');
    catMap.set(cat, (catMap.get(cat) || 0) + Number(e.amount));
  });

  const monthName = new Date(year, month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  let msg = `📊 <b>SMOKZY MONTHLY SUMMARY</b>\n`;
  msg += `📅 ${monthName}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `<b>💰 FINANCIAL OVERVIEW</b>\n`;
  msg += `Monthly Payroll Liability: <b>${fmt(totalPayroll)}</b>\n`;
  msg += `Total Cash Outflow: <b>${fmt(totalCashOut)}</b>\n`;
  msg += `Salary Paid: <b>${fmt(totalSalaryPaid)}</b>\n`;
  msg += `Expenses Approved: <b>${fmt(totalExpApproved)}</b>\n`;
  msg += `Advances Paid: <b>${fmt(totalAdvPaid)}</b>\n`;
  msg += `Advances Outstanding: <b>${fmt(advOutstanding)}</b>\n\n`;

  msg += `<b>📋 SETTLEMENT DETAILS</b>\n`;
  msg += `Settlements: ${sett.length} (${sett.filter((s: any) => s.status === 'settled').length} settled, ${sett.filter((s: any) => s.status === 'pending').length} pending)\n`;
  msg += `Leave Deductions: ${fmt(totalLeaveDeductionAmt)} (${totalLeaveDeductions} days)\n`;
  msg += `Advances Adjusted: ${fmt(totalAdvancesAdj)}\n\n`;

  msg += `<b>📊 ACTIVITY COUNTS</b>\n`;
  msg += `Total Transactions: ${(journals.data || []).length}\n`;
  msg += `Expenses: ${exp.length} (${exp.filter((e: any) => e.status === 'pending').length} pending)\n`;
  msg += `Advances: ${adv.length}\n`;
  msg += `Leave Records: ${lv.length}\n`;
  msg += `Active Staff: ${staffData.length}\n\n`;

  if (catMap.size > 0) {
    msg += `<b>📂 EXPENSE CATEGORIES</b>\n`;
    const totalCat = Array.from(catMap.values()).reduce((s, v) => s + v, 0);
    for (const [cat, amt] of [...catMap.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = totalCat > 0 ? ((amt / totalCat) * 100).toFixed(1) : '0.0';
      msg += `• ${esc(cat)}: ${fmt(amt)} (${pct}%)\n`;
    }
    msg += '\n';
  }

  msg += `<i>Monthly report — ${monthName}</i>`;
  return msg;
}
