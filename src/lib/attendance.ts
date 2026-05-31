import { supabase } from '@/integrations/supabase/client';
import { computeAndLogDiscipline } from '@/lib/discipline';

export type AttendanceStatus = 'active' | 'on_break' | 'completed';

export interface AttendanceSession {
  id: string;
  user_id: string;
  staff_id: string | null;
  work_date: string;
  check_in_at: string;
  check_in_photo_url: string;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_accuracy: number | null;
  check_out_at: string | null;
  check_out_photo_url: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_accuracy: number | null;
  total_break_minutes: number;
  worked_minutes: number | null;
  status: AttendanceStatus;
  late_checkout: boolean;
  created_at: string;
  updated_at: string;
  overtime_reminder_sent?: boolean;
  auto_closed?: boolean;
}

export interface AttendanceBreak {
  id: string;
  session_id: string;
  start_at: string;
  end_at: string | null;
  duration_minutes: number | null;
}

export interface CapturePayload {
  photoBlob: Blob;
  lat: number;
  lng: number;
  accuracy: number;
}

const BUCKET = 'attendance-photos';

function localDateString(d: Date = new Date()): string {
  // YYYY-MM-DD in local timezone
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

async function uploadPhoto(userId: string, sessionId: string, kind: 'checkin' | 'checkout', blob: Blob): Promise<string> {
  const path = `${userId}/${sessionId}/${kind}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function getCurrentSession(userId: string): Promise<AttendanceSession | null> {
  const { data, error } = await supabase
    .from('attendance_sessions' as never)
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'on_break'])
    .order('check_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AttendanceSession | null) ?? null;
}

export async function getTodayCompletedSession(userId: string): Promise<AttendanceSession | null> {
  const { data, error } = await supabase
    .from('attendance_sessions' as never)
    .select('*')
    .eq('user_id', userId)
    .eq('work_date', localDateString())
    .eq('status', 'completed')
    .order('check_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AttendanceSession | null) ?? null;
}

export async function getSessionBreaks(sessionId: string): Promise<AttendanceBreak[]> {
  const { data, error } = await supabase
    .from('attendance_breaks' as never)
    .select('*')
    .eq('session_id', sessionId)
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data as AttendanceBreak[]) ?? [];
}

export async function checkIn(
  userId: string,
  staffId: string | null,
  payload: CapturePayload,
): Promise<AttendanceSession> {
  // Insert row first to get id, with placeholder photo url
  const { data: inserted, error: insertErr } = await supabase
    .from('attendance_sessions' as never)
    .insert({
      user_id: userId,
      staff_id: staffId,
      work_date: localDateString(),
      check_in_at: new Date().toISOString(),
      check_in_photo_url: 'pending',
      check_in_lat: payload.lat,
      check_in_lng: payload.lng,
      check_in_accuracy: payload.accuracy,
      status: 'active',
    } as never)
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  const session = inserted as AttendanceSession;

  const path = await uploadPhoto(userId, session.id, 'checkin', payload.photoBlob);
  const { data: updated, error: updErr } = await supabase
    .from('attendance_sessions' as never)
    .update({ check_in_photo_url: path } as never)
    .eq('id', session.id)
    .select('*')
    .single();
  if (updErr) throw updErr;
  const result = updated as AttendanceSession;
  return result;
}


export async function startBreak(sessionId: string): Promise<void> {
  const { error: insErr } = await supabase
    .from('attendance_breaks' as never)
    .insert({ session_id: sessionId, start_at: new Date().toISOString() } as never);
  if (insErr) throw insErr;
  const { error: updErr } = await supabase
    .from('attendance_sessions' as never)
    .update({ status: 'on_break' } as never)
    .eq('id', sessionId);
  if (updErr) throw updErr;
}

export async function endBreak(sessionId: string): Promise<void> {
  // Find the open break
  const { data: openBreak, error: selErr } = await supabase
    .from('attendance_breaks' as never)
    .select('*')
    .eq('session_id', sessionId)
    .is('end_at', null)
    .order('start_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!openBreak) throw new Error('No open break found');
  const br = openBreak as AttendanceBreak;
  const endAt = new Date();
  const startAt = new Date(br.start_at);
  const minutes = Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60000));

  const { error: updBrkErr } = await supabase
    .from('attendance_breaks' as never)
    .update({ end_at: endAt.toISOString(), duration_minutes: minutes } as never)
    .eq('id', br.id);
  if (updBrkErr) throw updBrkErr;

  // Recompute total breaks
  const { data: allBreaks } = await supabase
    .from('attendance_breaks' as never)
    .select('duration_minutes')
    .eq('session_id', sessionId);
  const total = (allBreaks ?? []).reduce(
    (sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes ?? 0),
    0,
  );

  const { error: updSesErr } = await supabase
    .from('attendance_sessions' as never)
    .update({ status: 'active', total_break_minutes: total } as never)
    .eq('id', sessionId);
  if (updSesErr) throw updSesErr;
}

export async function checkOut(
  userId: string,
  session: AttendanceSession,
  payload: CapturePayload,
): Promise<AttendanceSession> {
  // If a break is open, close it first
  if (session.status === 'on_break') {
    await endBreak(session.id);
  }

  // Recompute totals
  const { data: allBreaks } = await supabase
    .from('attendance_breaks' as never)
    .select('duration_minutes')
    .eq('session_id', session.id);
  const totalBreak = (allBreaks ?? []).reduce(
    (sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes ?? 0),
    0,
  );

  const checkOutAt = new Date();
  const checkInAt = new Date(session.check_in_at);
  const totalMinutes = Math.max(
    0,
    Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000),
  );
  const workedMinutes = Math.max(0, totalMinutes - totalBreak);

  // Late checkout if work_date is more than 1 day before today
  const lateCutoff = new Date();
  lateCutoff.setHours(6, 0, 0, 0);
  const workDate = new Date(session.work_date + 'T00:00:00');
  const dayDiff = Math.floor(
    (lateCutoff.getTime() - workDate.getTime()) / (24 * 60 * 60 * 1000),
  );
  const lateCheckout = dayDiff > 1;

  const path = await uploadPhoto(userId, session.id, 'checkout', payload.photoBlob);

  const { data: updated, error } = await supabase
    .from('attendance_sessions' as never)
    .update({
      status: 'completed',
      check_out_at: checkOutAt.toISOString(),
      check_out_photo_url: path,
      check_out_lat: payload.lat,
      check_out_lng: payload.lng,
      check_out_accuracy: payload.accuracy,
      total_break_minutes: totalBreak,
      worked_minutes: workedMinutes,
      late_checkout: lateCheckout,
    } as never)
    .eq('id', session.id)
    .select('*')
    .single();
  if (error) throw error;

  // Compute discipline fine (best-effort; non-blocking on failure)
  if (session.staff_id) {
    try {
      const { data: staffRow } = await supabase
        .from('staff')
        .select('id, monthly_salary, attendance_tracked')
        .eq('id', session.staff_id)
        .maybeSingle();
      if (staffRow && (staffRow as { attendance_tracked?: boolean }).attendance_tracked !== false) {
        const monthlySalary = Number((staffRow as { monthly_salary?: number }).monthly_salary || 0);
        const wd = new Date(session.work_date + 'T00:00:00');
        const daysInMonth = new Date(wd.getFullYear(), wd.getMonth() + 1, 0).getDate();
        await computeAndLogDiscipline({
          staffId: session.staff_id,
          userId,
          sessionId: session.id,
          workDate: session.work_date,
          checkInIso: session.check_in_at,
          checkOutIso: checkOutAt.toISOString(),
          monthlySalary,
          daysInMonth,
        });
      }
    } catch (e) {
      console.error('Discipline compute failed', e);
    }
  }

  if (session.staff_id) {
    notifyCheckoutWhatsapp(session.staff_id, checkOutAt.toISOString(), session.work_date);
  }

  return updated as AttendanceSession;
}

export async function getSignedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path || path === 'pending') return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Formats a session timestamp, appending the date suffix (e.g. ", 20 May") when
 * the timestamp falls on a different calendar day than the session's work_date.
 * Used so night-shift checkouts after midnight read as "2:00 AM, 20 May".
 */
export function formatSessionTime(iso: string | null | undefined, workDate: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (ymd === workDate) return timeStr;
  const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${timeStr}, ${dateStr}`;
}

export function googleMapsLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
