// ============================================================================
// Holiday templates — DB service layer (uses the repo's anyClient).
// ============================================================================

import { supabase } from '@/integrations/supabase/anyClient';

export interface HolidayDay {
  id?: string;
  template_id?: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  holidayCount: number;
  assignedCount: number;
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const [{ data: templates, error }, { data: days }, { data: assigns }] = await Promise.all([
    supabase.from('holiday_template').select('id, name, created_at, updated_at').order('created_at', { ascending: false }),
    supabase.from('holiday_template_days').select('template_id'),
    supabase.from('employee_holiday_template').select('template_id'),
  ]);
  if (error) throw error;
  const dayCount = new Map<string, number>();
  for (const d of (days ?? []) as Array<{ template_id: string }>) dayCount.set(d.template_id, (dayCount.get(d.template_id) ?? 0) + 1);
  const assignCount = new Map<string, number>();
  for (const a of (assigns ?? []) as Array<{ template_id: string }>) assignCount.set(a.template_id, (assignCount.get(a.template_id) ?? 0) + 1);
  return ((templates ?? []) as Array<{ id: string; name: string; created_at: string; updated_at: string }>).map((t) => ({
    ...t,
    holidayCount: dayCount.get(t.id) ?? 0,
    assignedCount: assignCount.get(t.id) ?? 0,
  }));
}

export async function getTemplateDays(templateId: string): Promise<HolidayDay[]> {
  const { data, error } = await supabase
    .from('holiday_template_days')
    .select('id, template_id, name, start_date, end_date')
    .eq('template_id', templateId)
    .order('start_date');
  if (error) throw error;
  return (data ?? []) as HolidayDay[];
}

/** Create or replace a template + its holidays in one save. */
export async function saveTemplate(opts: { id?: string; name: string; days: HolidayDay[]; userId: string | null }): Promise<string> {
  const { id, name, days, userId } = opts;
  let templateId = id;

  if (templateId) {
    const { error } = await supabase.from('holiday_template').update({ name }).eq('id', templateId);
    if (error) throw error;
    // Replace the day set.
    const { error: delErr } = await supabase.from('holiday_template_days').delete().eq('template_id', templateId);
    if (delErr) throw delErr;
  } else {
    const { data, error } = await supabase.from('holiday_template').insert({ name, created_by: userId }).select('id').single();
    if (error) throw error;
    templateId = (data as { id: string }).id;
  }

  if (days.length) {
    const { error } = await supabase.from('holiday_template_days').insert(
      days.map((d) => ({ template_id: templateId, name: d.name, start_date: d.start_date, end_date: d.end_date })),
    );
    if (error) throw error;
  }
  return templateId!;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('holiday_template').delete().eq('id', id);
  if (error) throw error;
}

/** Assign a template to staff — one active template per employee (replace). */
export async function assignTemplate(staffIds: string[], templateId: string, userId: string | null): Promise<void> {
  if (staffIds.length === 0) return;
  const { error } = await supabase
    .from('employee_holiday_template')
    .upsert(staffIds.map((s) => ({ staff_id: s, template_id: templateId, assigned_by: userId, assigned_at: new Date().toISOString() })), { onConflict: 'staff_id' });
  if (error) throw error;
}

export async function listAssignments(): Promise<Array<{ staff_id: string; template_id: string }>> {
  const { data, error } = await supabase.from('employee_holiday_template').select('staff_id, template_id');
  if (error) throw error;
  return (data ?? []) as Array<{ staff_id: string; template_id: string }>;
}
