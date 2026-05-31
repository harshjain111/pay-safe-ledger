import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Slab = 'on_time' | 'level_1' | 'level_2' | 'half_day' | 'full_day' | 'absent' | 'penalty_waived' | 'checkout_reminder';

interface Payload {
  staff_name: string;
  staff_phone: string;
  staff_id?: string | null;
  event_type: 'checkin' | 'checkout' | 'absent' | 'penalty_waived' | 'checkout_reminder';
  actual_time: string;
  scheduled_time: string;
  slab: Slab;
  deduction_amount: number;
  penalty_date?: string;
}

function formatIST(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function stripPlus(phone: string): string {
  return phone.startsWith('+') ? phone.slice(1) : phone;
}

function normalizePhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) return `91${clean}`;
  if (clean.length === 11 && clean.startsWith('0')) return `91${clean.slice(1)}`;
  if (clean.length === 12 && clean.startsWith('91')) return clean;
  throw new Error('Invalid phone number format');
}

function extractWabanowError(data: unknown): string | null {
  if (Array.isArray(data)) {
    const first = data[0] as { errorDescription?: string; errorCode?: number | string } | undefined;
    if (first?.errorDescription) return `${first.errorDescription}${first.errorCode ? ` (${first.errorCode})` : ''}`;
  }
  const obj = data as { error?: { message?: string }; message?: string; errorDescription?: string; errorCode?: number | string };
  if (obj?.error?.message) return obj.error.message;
  if (obj?.errorDescription) return `${obj.errorDescription}${obj.errorCode ? ` (${obj.errorCode})` : ''}`;
  if (obj?.message) return obj.message;
  return null;
}

function buildPayload(p: Payload): { templateName: string; body: Record<string, unknown> } {
  const to = normalizePhone(p.staff_phone);
  const timeStr = formatIST(p.actual_time);
  const amt = `${p.deduction_amount}`;

  let templateName = '';
  let parameters: Array<{ type: 'text'; text: string }> = [];

  switch (p.slab) {
    case 'on_time':
      // Use a check-out-specific template when this is a check-out event,
      // otherwise the body wording ("successfully checked in") is misleading.
      templateName = p.event_type === 'checkout' ? 'attendance_checkout_on_time' : 'attendance_on_time';
      parameters = [
        { type: 'text', text: p.staff_name },
        { type: 'text', text: timeStr },
      ];
      break;
    case 'level_1':
      // Check-out late/early uses a dedicated early-out template so the
      // wording is "checked out early", not "check-in time today was…".
      templateName = p.event_type === 'checkout' ? 'attendance_early_out_level_1' : 'attendance_late_level_1';
      parameters = [
        { type: 'text', text: p.staff_name },
        { type: 'text', text: timeStr },
        { type: 'text', text: amt },
      ];
      break;
    case 'level_2':
      templateName = p.event_type === 'checkout' ? 'attendance_early_out_level_2' : 'attendance_late_level_2';
      parameters = [
        { type: 'text', text: p.staff_name },
        { type: 'text', text: timeStr },
        { type: 'text', text: amt },
      ];
      break;
    case 'half_day':
      templateName = p.event_type === 'checkout' ? 'attendance_early_out_half_day' : 'attendance_half_day';
      parameters = [
        { type: 'text', text: p.staff_name },
        { type: 'text', text: timeStr },
      ];
      break;
    case 'full_day':
      templateName = p.event_type === 'checkout' ? 'attendance_early_out_full_day' : 'attendance_full_day';
      parameters = [
        { type: 'text', text: p.staff_name },
        { type: 'text', text: timeStr },
      ];
      break;
    case 'absent': {
      templateName = 'attendance_absent';
      const absentDateStr = p.penalty_date
        ? new Date(p.penalty_date).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : new Date(p.actual_time).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
      parameters = [{ type: 'text', text: absentDateStr }];
      break;
    }
    case 'penalty_waived': {
      templateName = 'attendance_penalty_waived';
      const dateStr = p.penalty_date
        ? new Date(p.penalty_date).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : '';
      parameters = [
        { type: 'text', text: amt },
        { type: 'text', text: dateStr },
      ];
      break;
    }
    case 'checkout_reminder':
      templateName = 'attendance_checkout_reminder';
      parameters = [];
      break;
  }

  // checkout_reminder template has NO body parameters — omit components entirely.
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: 'en', policy: 'deterministic' },
  };
  if (p.slab !== 'checkout_reminder') {
    template.components = [{ type: 'BODY', parameters }];
  }

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template,
  };

  return { templateName, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Same provider contract as Smokzy Financial Core: WABANOW_API_KEY + fixed approved WABA number.
  const apiKey = Deno.env.get('WABANOW_API_KEY')?.trim() || Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim();
  const wabaNumber = '918822866510';

  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'WhatsApp credentials not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let templateName = '';
  let waBody: Record<string, unknown>;
  try {
    ({ templateName, body: waBody } = buildPayload(payload));
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Invalid WhatsApp payload' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let success = false;
  let metaMessageId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch('https://api.wabanow.com/wrapper/waba/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'key': apiKey,
        'wabaNumber': wabaNumber,
      },
      body: JSON.stringify(waBody),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    const msgId =
      (data as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ??
      (data as { id?: string })?.id ??
      null;
    const looksEmpty = !text || text.trim().length === 0;
    const providerError = extractWabanowError(data);

    if (!res.ok || looksEmpty || providerError || (!msgId && !(data as { success?: boolean })?.success)) {
      errorMessage =
        looksEmpty
          ? `Wabanow returned empty body (HTTP ${res.status}) — template/language likely rejected`
          : providerError ?? `Wabanow error HTTP ${res.status}: ${text.slice(0, 300)}`;
      console.error('Wabanow rejected:', errorMessage);
    } else {
      metaMessageId = msgId;
      success = true;
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('Fetch error:', errorMessage);
  }

  try {
    await supabase.from('whatsapp_notification_log').insert({
      staff_id: payload.staff_id ?? null,
      staff_phone: stripPlus(payload.staff_phone),
      event_type: payload.event_type,
      slab: payload.slab,
      template_name: templateName,
      deduction_amount: payload.deduction_amount ?? 0,
      success,
      error_message: errorMessage,
      meta_message_id: metaMessageId,
    });
  } catch (e) {
    console.error('Failed to log whatsapp send:', e);
  }

  if (success) {
    return new Response(
      JSON.stringify({ success: true, message_id: metaMessageId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  return new Response(
    JSON.stringify({ success: false, error: errorMessage }),
    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
