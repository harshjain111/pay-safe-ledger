import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type HolidayType = 'public' | 'optional' | 'restricted';

export interface HolidayInput {
  name: string;
  date: string; // yyyy-MM-dd
  type: HolidayType;
  is_paid: boolean;
  recurring_yearly: boolean;
  org_wide: boolean;
  note: string | null;
}

export interface HolidayTargets {
  outletIds: string[];
  staffIds: string[];
}

export interface HolidayWithAssignments extends HolidayInput {
  id: string;
  outletIds: string[];
  staffIds: string[];
}

/** CRUD for holidays + their branch/staff assignments. */
export function useHolidays() {
  const { user } = useAuth();
  const [holidays, setHolidays] = useState<HolidayWithAssignments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hRes, aRes] = await Promise.all([
        supabase
          .from('holidays')
          .select('id, name, date, type, is_paid, recurring_yearly, org_wide, note')
          .order('date'),
        supabase.from('holiday_assignments').select('holiday_id, outlet_id, staff_id'),
      ]);
      if (hRes.error) throw hRes.error;
      if (aRes.error) throw aRes.error;

      const byHoliday = new Map<string, { outletIds: string[]; staffIds: string[] }>();
      for (const a of aRes.data ?? []) {
        const e = byHoliday.get(a.holiday_id) ?? { outletIds: [], staffIds: [] };
        if (a.outlet_id) e.outletIds.push(a.outlet_id);
        if (a.staff_id) e.staffIds.push(a.staff_id);
        byHoliday.set(a.holiday_id, e);
      }

      setHolidays(
        (hRes.data ?? []).map((h) => ({
          ...(h as Omit<HolidayWithAssignments, 'outletIds' | 'staffIds'>),
          outletIds: byHoliday.get(h.id)?.outletIds ?? [],
          staffIds: byHoliday.get(h.id)?.staffIds ?? [],
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load holidays');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const writeAssignments = async (holidayId: string, orgWide: boolean, targets: HolidayTargets) => {
    await supabase.from('holiday_assignments').delete().eq('holiday_id', holidayId);
    if (orgWide) return;
    const rows = [
      ...targets.outletIds.map((o) => ({ holiday_id: holidayId, outlet_id: o, staff_id: null })),
      ...targets.staffIds.map((s) => ({ holiday_id: holidayId, outlet_id: null, staff_id: s })),
    ];
    if (rows.length) {
      const { error } = await supabase.from('holiday_assignments').insert(rows);
      if (error) throw error;
    }
  };

  const createHoliday = useCallback(
    async (input: HolidayInput, targets: HolidayTargets) => {
      const { data, error } = await supabase
        .from('holidays')
        .insert({ ...input, created_by: user?.id ?? null })
        .select('id')
        .single();
      if (error) throw error;
      await writeAssignments(data.id, input.org_wide, targets);
      await reload();
    },
    [user?.id, reload],
  );

  const updateHoliday = useCallback(
    async (id: string, input: HolidayInput, targets: HolidayTargets) => {
      const { error } = await supabase.from('holidays').update(input).eq('id', id);
      if (error) throw error;
      await writeAssignments(id, input.org_wide, targets);
      await reload();
    },
    [reload],
  );

  const deleteHoliday = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('holidays').delete().eq('id', id);
      if (error) throw error;
      await reload();
    },
    [reload],
  );

  return { holidays, loading, error, reload, createHoliday, updateHoliday, deleteHoliday };
}
