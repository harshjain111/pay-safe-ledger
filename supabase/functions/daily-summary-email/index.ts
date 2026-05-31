import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const JUVLON_API_KEY = Deno.env.get("JUVLON_API_KEY");
    if (!JUVLON_API_KEY) {
      throw new Error("JUVLON_API_KEY is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get today's date range in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().split("T")[0]; // YYYY-MM-DD
    const todayStart = `${todayIST}T00:00:00+05:30`;
    const todayEnd = `${todayIST}T23:59:59+05:30`;

    // Parallel queries for all daily stats
    const [
      advancesPaidResult,
      expensesRequestedResult,
      expensesApprovedResult,
      expensesRejectedResult,
      expensesReimbursedResult,
      requestsApprovedResult,
      requestsRejectedResult,
      settlementsCreatedResult,
      settlementsSettledResult,
      newStaffResult,
      leaveRecordsResult,
      journalEntriesTodayResult,
      activeStaffResult,
    ] = await Promise.all([
      // Advances paid today (journal entries with type advance_paid)
      supabase
        .from("journal_entries")
        .select("id, description, staff_id, staff:staff!journal_entries_staff_id_fkey(full_name)")
        .eq("transaction_type", "advance_paid")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),

      // Expenses submitted/requested today
      supabase
        .from("expenses")
        .select("id, amount, category, description, staff:staff!expenses_staff_id_fkey(full_name)")
        .gte("submitted_at", todayStart)
        .lte("submitted_at", todayEnd),

      // Expenses approved today
      supabase
        .from("expenses")
        .select("id, amount, category, staff:staff!expenses_staff_id_fkey(full_name)")
        .eq("status", "approved")
        .gte("approved_at", todayStart)
        .lte("approved_at", todayEnd),

      // Expenses rejected today
      supabase
        .from("expenses")
        .select("id, amount, category, rejection_reason, staff:staff!expenses_staff_id_fkey(full_name)")
        .eq("status", "rejected")
        .gte("approved_at", todayStart)
        .lte("approved_at", todayEnd),

      // Expenses reimbursed today
      supabase
        .from("expenses")
        .select("id, amount, category, staff:staff!expenses_staff_id_fkey(full_name)")
        .eq("status", "reimbursed")
        .gte("reimbursed_at", todayStart)
        .lte("reimbursed_at", todayEnd),

      // Payment requests approved today
      supabase
        .from("payment_requests")
        .select("id, amount, reason, payout_type, staff:staff!payment_requests_staff_id_fkey(full_name)")
        .eq("status", "approved")
        .gte("approved_at", todayStart)
        .lte("approved_at", todayEnd),

      // Payment requests rejected today
      supabase
        .from("payment_requests")
        .select("id, amount, reason, rejection_reason, staff:staff!payment_requests_staff_id_fkey(full_name)")
        .eq("status", "rejected")
        .gte("updated_at", todayStart)
        .lte("updated_at", todayEnd),

      // Salary settlements created today
      supabase
        .from("salary_settlements")
        .select("id, balance_payable, settlement_month, staff:staff!salary_settlements_staff_id_fkey(full_name)")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),

      // Salary settlements settled/paid today
      supabase
        .from("salary_settlements")
        .select("id, balance_payable, settlement_month, staff:staff!salary_settlements_staff_id_fkey(full_name)")
        .eq("status", "settled")
        .gte("settled_at", todayStart)
        .lte("settled_at", todayEnd),

      // New staff added today
      supabase
        .from("staff")
        .select("id, full_name, designation")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),

      // Leave records created today
      supabase
        .from("leave_records")
        .select("id, leave_date, leave_type, deduction_days, status, staff:staff!leave_records_staff_id_fkey(full_name)")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),

      // Total journal entries today (transaction count)
      supabase
        .from("journal_entries")
        .select("id")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd),

      // Active staff count
      supabase
        .from("staff")
        .select("id")
        .eq("is_active", true),
    ]);

    // Calculate advance amounts from journal_lines
    const advanceEntryIds = (advancesPaidResult.data || []).map((e: any) => e.id);
    let totalAdvancesPaid = 0;
    if (advanceEntryIds.length > 0) {
      const { data: advLines } = await supabase
        .from("journal_lines")
        .select("debit, account_id")
        .in("journal_entry_id", advanceEntryIds);
      
      // Get Staff Advances account
      const { data: advAccount } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", "1200")
        .single();
      
      if (advAccount && advLines) {
        totalAdvancesPaid = advLines
          .filter((l: any) => l.account_id === advAccount.id)
          .reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
      }
    }

    const expensesRequested = expensesRequestedResult.data || [];
    const expensesApproved = expensesApprovedResult.data || [];
    const expensesRejected = expensesRejectedResult.data || [];
    const expensesReimbursed = expensesReimbursedResult.data || [];
    const requestsApproved = requestsApprovedResult.data || [];
    const requestsRejected = requestsRejectedResult.data || [];
    const settlementsCreated = settlementsCreatedResult.data || [];
    const settlementsSettled = settlementsSettledResult.data || [];
    const newStaff = newStaffResult.data || [];
    const leaveRecords = leaveRecordsResult.data || [];
    const totalTransactions = (journalEntriesTodayResult.data || []).length;
    const activeStaffCount = (activeStaffResult.data || []).length;

    const totalExpensesRequestedAmount = expensesRequested.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const totalExpensesApprovedAmount = expensesApproved.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const totalExpensesRejectedAmount = expensesRejected.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const totalExpensesReimbursedAmount = expensesReimbursed.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const totalRequestsApprovedAmount = requestsApproved.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const totalRequestsRejectedAmount = requestsRejected.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const totalSettlementsAmount = settlementsSettled.reduce((s: number, ss: any) => s + Number(ss.balance_payable || 0), 0);

    // Format currency
    const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

    // Format date nicely
    const dateStr = new Date(todayIST + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Build HTML email
    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6f9; margin: 0; padding: 20px; }
  .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
  .header p { margin: 6px 0 0; opacity: 0.8; font-size: 14px; }
  .body { padding: 28px 32px; }
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .stat-card { background: #f8f9fc; border-radius: 10px; padding: 16px; border-left: 4px solid #4361ee; }
  .stat-card.green { border-left-color: #2ec4b6; }
  .stat-card.red { border-left-color: #e63946; }
  .stat-card.orange { border-left-color: #f77f00; }
  .stat-card.purple { border-left-color: #7209b7; }
  .stat-card.blue { border-left-color: #4361ee; }
  .stat-value { font-size: 24px; font-weight: 700; color: #1a1a2e; }
  .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .section { margin-bottom: 24px; }
  .section h3 { font-size: 15px; color: #1a1a2e; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #f0f0f5; }
  .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; }
  .detail-row:last-child { border-bottom: none; }
  .detail-name { color: #374151; }
  .detail-amount { font-weight: 600; color: #1a1a2e; }
  .detail-amount.credit { color: #2ec4b6; }
  .detail-amount.debit { color: #e63946; }
  .empty { color: #9ca3af; font-style: italic; font-size: 13px; }
  .footer { background: #f8f9fc; padding: 20px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-yellow { background: #fef3c7; color: #92400e; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 Daily Summary — Smokzy</h1>
    <p>${dateStr}</p>
  </div>
  <div class="body">

    <!-- Key Stats -->
    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="stat-value">${totalTransactions}</div>
        <div class="stat-label">Total Transactions</div>
      </div>
      <div class="stat-card green">
        <div class="stat-value">${activeStaffCount}</div>
        <div class="stat-label">Active Staff</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-value">${fmt(totalAdvancesPaid)}</div>
        <div class="stat-label">Advances Paid</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-value">${fmt(totalSettlementsAmount)}</div>
        <div class="stat-label">Salaries Settled</div>
      </div>
    </div>

    <!-- Expenses Summary -->
    <div class="section">
      <h3>💰 Expenses</h3>
      <div class="detail-row">
        <span class="detail-name">Requested (${expensesRequested.length})</span>
        <span class="detail-amount">${fmt(totalExpensesRequestedAmount)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-name">Approved (${expensesApproved.length})</span>
        <span class="detail-amount credit">${fmt(totalExpensesApprovedAmount)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-name">Rejected (${expensesRejected.length})</span>
        <span class="detail-amount debit">${fmt(totalExpensesRejectedAmount)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-name">Reimbursed (${expensesReimbursed.length})</span>
        <span class="detail-amount credit">${fmt(totalExpensesReimbursedAmount)}</span>
      </div>
    </div>

    <!-- Payment Requests -->
    <div class="section">
      <h3>📋 Payment Requests</h3>
      <div class="detail-row">
        <span class="detail-name">Approved (${requestsApproved.length})</span>
        <span class="detail-amount credit">${fmt(totalRequestsApprovedAmount)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-name">Rejected (${requestsRejected.length})</span>
        <span class="detail-amount debit">${fmt(totalRequestsRejectedAmount)}</span>
      </div>
    </div>

    <!-- Advances Detail -->
    ${advancesPaidResult.data && advancesPaidResult.data.length > 0 ? `
    <div class="section">
      <h3>🏦 Advances Paid (${advancesPaidResult.data.length})</h3>
      ${advancesPaidResult.data.map((a: any) => `
      <div class="detail-row">
        <span class="detail-name">${a.staff?.full_name || 'Unknown'}</span>
        <span class="detail-amount">${a.description || ''}</span>
      </div>`).join('')}
    </div>` : ''}

    <!-- Salary Settlements -->
    ${settlementsSettled.length > 0 ? `
    <div class="section">
      <h3>💵 Salary Settlements (${settlementsSettled.length})</h3>
      ${settlementsSettled.map((s: any) => `
      <div class="detail-row">
        <span class="detail-name">${s.staff?.full_name || 'Unknown'} — ${s.settlement_month}</span>
        <span class="detail-amount credit">${fmt(Number(s.balance_payable || 0))}</span>
      </div>`).join('')}
    </div>` : ''}

    <!-- Leave Records -->
    ${leaveRecords.length > 0 ? `
    <div class="section">
      <h3>🗓️ Leave Records (${leaveRecords.length})</h3>
      ${leaveRecords.map((l: any) => `
      <div class="detail-row">
        <span class="detail-name">${l.staff?.full_name || 'Unknown'} — ${l.leave_date}</span>
        <span class="detail-amount">
          <span class="badge ${l.status === 'approved' ? 'badge-green' : l.status === 'rejected' ? 'badge-red' : 'badge-yellow'}">${l.status}</span>
          ${l.leave_type}
        </span>
      </div>`).join('')}
    </div>` : ''}

    <!-- New Staff -->
    ${newStaff.length > 0 ? `
    <div class="section">
      <h3>👤 New Staff Added (${newStaff.length})</h3>
      ${newStaff.map((s: any) => `
      <div class="detail-row">
        <span class="detail-name">${s.full_name}</span>
        <span class="detail-amount">${s.designation || '—'}</span>
      </div>`).join('')}
    </div>` : ''}

  </div>
  <div class="footer">
    Smokzy Daily Summary • Auto-generated at 11:45 PM IST<br>
    This is an automated report. Do not reply to this email.
  </div>
</div>
</body>
</html>`;

    // Send via Juvlon httpSendMail API
    const juvlonResponse = await fetch("https://api2.juvlon.com/v4/httpSendMail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ApiKey: JUVLON_API_KEY,
        requests: [
          {
            subject: `Smokzy Daily Summary — ${dateStr}`,
            from: "noreply@smokzy.com",
            body: html,
            to: "hjainmay@gmail.com",
          },
        ],
      }),
    });

    const juvlonResult = await juvlonResponse.json();
    console.log("Juvlon response:", JSON.stringify(juvlonResult));

    if (!juvlonResponse.ok) {
      throw new Error(`Juvlon API failed [${juvlonResponse.status}]: ${JSON.stringify(juvlonResult)}`);
    }

    return new Response(
      JSON.stringify({ success: true, juvlon: juvlonResult }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("daily-summary-email error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
