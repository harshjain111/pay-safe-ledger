import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type EnrolmentStatus = 'enrolled' | 'pending' | 'failed' | 'none';

export interface EnrolmentRow {
  staffId: string;
  fullName: string;
  employeeId: string;
  outletId: string | null;
  outletName: string | null;
  status: EnrolmentStatus;
  kind: string | null;
  enrolledAt: string | null;
  /** biometric_enrolments.id of the staff's global enrolment, if one exists. */
  enrolmentId: string | null;
  faceVectorRef: string | null;
}

interface EnrolmentSummary {
  rows: EnrolmentRow[];
  total: number;
  enrolled: number;
  pending: number;
}

const EMPTY: EnrolmentSummary = { rows: [], total: 0, enrolled: 0, pending: 0 };

/**
 * Tracks biometric enrolment across attendance-tracked staff.
 *
 * "Pending biometrics" = active, attendance-tracked staff with no enrolled
 * record. Enrolment is treated at the staff level (the global, device-independent
 * enrolment, device_id IS NULL); per-device rows are ignored here.
 */
export function useBiometricEnrolment() {
  const [data, setData] = useState<EnrolmentSummary>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [staffRes, enrolRes, outletRes] = await Promise.all([
        supabase
          .from('staff')
          .select('id, full_name, employee_id, outlet_id')
          .eq('is_active', true)
          .eq('attendance_tracked', true)
          .order('full_name'),
        supabase
          .from('biometric_enrolments')
          .select('id, staff_id, device_id, kind, status, enrolled_at, face_vector_ref'),
        supabase.from('outlets').select('id, name'),
      ]);

      if (staffRes.error) throw staffRes.error;
      if (enrolRes.error) throw enrolRes.error;

      const outletName = new Map<string, string>();
      for (const o of outletRes.data ?? []) outletName.set(o.id, o.name);

      // Prefer the staff's GLOBAL enrolment (device_id null); fall back to any.
      const byStaff = new Map<string, (typeof enrolRes.data)[number]>();
      for (const e of enrolRes.data ?? []) {
        const existing = byStaff.get(e.staff_id);
        if (!existing || (existing.device_id !== null && e.device_id === null)) {
          byStaff.set(e.staff_id, e);
        }
      }

      const rows: EnrolmentRow[] = (staffRes.data ?? []).map((s) => {
        const e = byStaff.get(s.id);
        const status: EnrolmentStatus = e
          ? e.status === 'enrolled'
            ? 'enrolled'
            : e.status === 'failed'
            ? 'failed'
            : 'pending'
          : 'none';
        return {
          staffId: s.id,
          fullName: s.full_name,
          employeeId: s.employee_id,
          outletId: s.outlet_id ?? null,
          outletName: s.outlet_id ? outletName.get(s.outlet_id) ?? null : null,
          status,
          kind: e?.kind ?? null,
          enrolledAt: e?.enrolled_at ?? null,
          enrolmentId: e?.id ?? null,
          faceVectorRef: e?.face_vector_ref ?? null,
        };
      });

      const enrolled = rows.filter((r) => r.status === 'enrolled').length;
      setData({ rows, total: rows.length, enrolled, pending: rows.length - enrolled });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load enrolment data');
      setData(EMPTY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, isLoading, error, reload };
}
