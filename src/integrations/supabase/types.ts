export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_breaks: {
        Row: {
          created_at: string
          duration_minutes: number | null
          end_at: string | null
          id: string
          session_id: string
          start_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          end_at?: string | null
          id?: string
          session_id: string
          start_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          end_at?: string | null
          id?: string
          session_id?: string
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_breaks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_discipline_log: {
        Row: {
          absent_reason: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_name: string | null
          computed_at: string
          early_out_minutes: number
          fine_amount: number
          fine_reason: string | null
          id: string
          is_absent: boolean
          is_cancelled: boolean
          late_in_minutes: number
          scheduled_check_in: string | null
          scheduled_check_out: string | null
          session_id: string | null
          staff_id: string
          work_date: string
        }
        Insert: {
          absent_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name?: string | null
          computed_at?: string
          early_out_minutes?: number
          fine_amount?: number
          fine_reason?: string | null
          id?: string
          is_absent?: boolean
          is_cancelled?: boolean
          late_in_minutes?: number
          scheduled_check_in?: string | null
          scheduled_check_out?: string | null
          session_id?: string | null
          staff_id: string
          work_date: string
        }
        Update: {
          absent_reason?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_name?: string | null
          computed_at?: string
          early_out_minutes?: number
          fine_amount?: number
          fine_reason?: string | null
          id?: string
          is_absent?: boolean
          is_cancelled?: boolean
          late_in_minutes?: number
          scheduled_check_in?: string | null
          scheduled_check_out?: string | null
          session_id?: string | null
          staff_id?: string
          work_date?: string
        }
        Relationships: []
      }
      attendance_policies: {
        Row: {
          created_at: string
          day_start_hour: number
          grace_minutes: number
          half_day_after_minutes: number | null
          id: string
          is_active: boolean
          missed_punch_action: string
          outlet_id: string | null
          scope: string
          staff_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_start_hour?: number
          grace_minutes?: number
          half_day_after_minutes?: number | null
          id?: string
          is_active?: boolean
          missed_punch_action?: string
          outlet_id?: string | null
          scope: string
          staff_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_start_hour?: number
          grace_minutes?: number
          half_day_after_minutes?: number | null
          id?: string
          is_active?: boolean
          missed_punch_action?: string
          outlet_id?: string | null
          scope?: string
          staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_policies_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_policies_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_policies_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          auto_closed: boolean
          check_in_accuracy: number | null
          check_in_address: string | null
          check_in_at: string
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_photo_url: string
          check_out_accuracy: number | null
          check_out_address: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_photo_url: string | null
          created_at: string
          geo_distance_m: number | null
          geo_flagged: boolean
          geo_review: string | null
          id: string
          late_checkout: boolean
          overtime_reminder_sent: boolean
          source: string
          staff_id: string | null
          status: string
          total_break_minutes: number
          updated_at: string
          user_id: string | null
          work_date: string
          worked_minutes: number | null
        }
        Insert: {
          auto_closed?: boolean
          check_in_accuracy?: number | null
          check_in_address?: string | null
          check_in_at?: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_url: string
          check_out_accuracy?: number | null
          check_out_address?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo_url?: string | null
          created_at?: string
          geo_distance_m?: number | null
          geo_flagged?: boolean
          geo_review?: string | null
          id?: string
          late_checkout?: boolean
          overtime_reminder_sent?: boolean
          source?: string
          staff_id?: string | null
          status?: string
          total_break_minutes?: number
          updated_at?: string
          user_id?: string | null
          work_date: string
          worked_minutes?: number | null
        }
        Update: {
          auto_closed?: boolean
          check_in_accuracy?: number | null
          check_in_address?: string | null
          check_in_at?: string
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_photo_url?: string
          check_out_accuracy?: number | null
          check_out_address?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_photo_url?: string | null
          created_at?: string
          geo_distance_m?: number | null
          geo_flagged?: boolean
          geo_review?: string | null
          id?: string
          late_checkout?: boolean
          overtime_reminder_sent?: boolean
          source?: string
          staff_id?: string | null
          status?: string
          total_break_minutes?: number
          updated_at?: string
          user_id?: string | null
          work_date?: string
          worked_minutes?: number | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          performed_at: string
          performed_by: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performed_at?: string
          performed_by?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      biometric_devices: {
        Row: {
          api_key_hash: string | null
          api_key_prefix: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          last_seen_at: string | null
          outlet_id: string | null
          serial: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          last_seen_at?: string | null
          outlet_id?: string | null
          serial?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          last_seen_at?: string | null
          outlet_id?: string | null
          serial?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_devices_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      biometric_enrolments: {
        Row: {
          created_at: string
          created_by: string | null
          device_id: string | null
          enrolled_at: string | null
          face_vector_ref: string | null
          id: string
          kind: string
          staff_id: string
          status: string
          template_ref: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          enrolled_at?: string | null
          face_vector_ref?: string | null
          id?: string
          kind?: string
          staff_id: string
          status?: string
          template_ref?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          enrolled_at?: string | null
          face_vector_ref?: string | null
          id?: string
          kind?: string
          staff_id?: string
          status?: string
          template_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometric_enrolments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "biometric_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biometric_enrolments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biometric_enrolments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      designations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      discipline_rules: {
        Row: {
          absent_no_checkin_deduction: string
          absent_no_checkout_deduction: string
          early_out_full_day_after_min: number
          early_out_half_day_after_min: number
          early_out_slabs: Json
          grace_minutes_in: number
          grace_minutes_out: number
          id: string
          late_in_full_day_after_min: number
          late_in_half_day_after_min: number
          late_in_slabs: Json
          penalties_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          absent_no_checkin_deduction?: string
          absent_no_checkout_deduction?: string
          early_out_full_day_after_min?: number
          early_out_half_day_after_min?: number
          early_out_slabs?: Json
          grace_minutes_in?: number
          grace_minutes_out?: number
          id?: string
          late_in_full_day_after_min?: number
          late_in_half_day_after_min?: number
          late_in_slabs?: Json
          penalties_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          absent_no_checkin_deduction?: string
          absent_no_checkout_deduction?: string
          early_out_full_day_after_min?: number
          early_out_half_day_after_min?: number
          early_out_slabs?: Json
          grace_minutes_in?: number
          grace_minutes_out?: number
          id?: string
          late_in_full_day_after_min?: number
          late_in_half_day_after_min?: number
          late_in_slabs?: Json
          penalties_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      employee_holiday_template: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          staff_id: string
          template_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          staff_id: string
          template_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          staff_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_holiday_template_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_holiday_template_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_holiday_template_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "holiday_template"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leave_balance: {
        Row: {
          balance: number
          created_at: string
          id: string
          leave_type_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          leave_type_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          leave_type_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leave_balance_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_balance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_balance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_history: {
        Row: {
          created_at: string
          created_by: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["employment_event_type"]
          from_value: string | null
          id: string
          notes: string | null
          staff_id: string
          to_value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_type: Database["public"]["Enums"]["employment_event_type"]
          from_value?: string | null
          id?: string
          notes?: string | null
          staff_id: string
          to_value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["employment_event_type"]
          from_value?: string | null
          id?: string
          notes?: string | null
          staff_id?: string
          to_value?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string | null
          event_date: string
          event_date_end: string | null
          id: string
          location: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          event_date: string
          event_date_end?: string | null
          id?: string
          location: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_date_end?: string | null
          id?: string
          location?: string
        }
        Relationships: []
      }
      grievances: {
        Row: {
          category: string
          created_on: string
          id: string
          message: string | null
          photo_path: string | null
          resolved_at: string | null
          reviewer_notes: string | null
          status: string
          submitted_by: string | null
          submitted_by_name: string | null
          voice_path: string | null
        }
        Insert: {
          category?: string
          created_on?: string
          id?: string
          message?: string | null
          photo_path?: string | null
          resolved_at?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_by?: string | null
          submitted_by_name?: string | null
          voice_path?: string | null
        }
        Update: {
          category?: string
          created_on?: string
          id?: string
          message?: string | null
          photo_path?: string | null
          resolved_at?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_by?: string | null
          submitted_by_name?: string | null
          voice_path?: string | null
        }
        Relationships: []
      }
      holiday_assignments: {
        Row: {
          created_at: string
          holiday_id: string
          id: string
          outlet_id: string | null
          staff_id: string | null
        }
        Insert: {
          created_at?: string
          holiday_id: string
          id?: string
          outlet_id?: string | null
          staff_id?: string | null
        }
        Update: {
          created_at?: string
          holiday_id?: string
          id?: string
          outlet_id?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holiday_assignments_holiday_id_fkey"
            columns: ["holiday_id"]
            isOneToOne: false
            referencedRelation: "holidays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_assignments_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_groups: {
        Row: {
          applies_to: string
          created_at: string
          created_by: string | null
          department_ids: string[]
          from_date: string
          id: string
          is_paid: boolean
          name: string
          outlet_ids: string[]
          roles: string[]
          to_date: string
        }
        Insert: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          department_ids?: string[]
          from_date: string
          id?: string
          is_paid?: boolean
          name: string
          outlet_ids?: string[]
          roles?: string[]
          to_date: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          created_by?: string | null
          department_ids?: string[]
          from_date?: string
          id?: string
          is_paid?: boolean
          name?: string
          outlet_ids?: string[]
          roles?: string[]
          to_date?: string
        }
        Relationships: []
      }
      holiday_template: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      holiday_template_days: {
        Row: {
          created_at: string
          end_date: string
          id: string
          name: string
          start_date: string
          template_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          name: string
          start_date: string
          template_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_template_days_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "holiday_template"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_paid: boolean
          name: string
          note: string | null
          org_wide: boolean
          recurring_yearly: boolean
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          is_paid?: boolean
          name: string
          note?: string | null
          org_wide?: boolean
          recurring_yearly?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_paid?: boolean
          name?: string
          note?: string | null
          org_wide?: boolean
          recurring_yearly?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_pay_rules: {
        Row: {
          attendance_mode: string
          comp_off_enabled: boolean
          full_day_minutes: number
          half_day_minutes: number
          id: string
          is_shift_wise_work_hrs: boolean
          singleton: boolean
          unscheduled_is_off: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attendance_mode?: string
          comp_off_enabled?: boolean
          full_day_minutes?: number
          half_day_minutes?: number
          id?: string
          is_shift_wise_work_hrs?: boolean
          singleton?: boolean
          unscheduled_is_off?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attendance_mode?: string
          comp_off_enabled?: boolean
          full_day_minutes?: number
          half_day_minutes?: number
          id?: string
          is_shift_wise_work_hrs?: boolean
          singleton?: boolean
          unscheduled_is_off?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          id: string
          is_immutable: boolean
          is_legacy: boolean
          paid_by: string | null
          paid_by_user_name: string | null
          reference_id: string | null
          reference_no: string
          reference_type: string | null
          staff_id: string | null
          transaction_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          id?: string
          is_immutable?: boolean
          is_legacy?: boolean
          paid_by?: string | null
          paid_by_user_name?: string | null
          reference_id?: string | null
          reference_no: string
          reference_type?: string | null
          staff_id?: string | null
          transaction_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          id?: string
          is_immutable?: boolean
          is_legacy?: boolean
          paid_by?: string | null
          paid_by_user_name?: string | null
          reference_id?: string | null
          reference_no?: string
          reference_type?: string | null
          staff_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          staff_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          staff_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balance_adjustment: {
        Row: {
          adjusted_at: string
          adjusted_by: string | null
          id: string
          leave_type_id: string
          new_balance: number
          old_balance: number
          remarks: string
          staff_id: string
        }
        Insert: {
          adjusted_at?: string
          adjusted_by?: string | null
          id?: string
          leave_type_id: string
          new_balance: number
          old_balance: number
          remarks: string
          staff_id: string
        }
        Update: {
          adjusted_at?: string
          adjusted_by?: string | null
          id?: string
          leave_type_id?: string
          new_balance?: number
          old_balance?: number
          remarks?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_balance_adjustment_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balance_adjustment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balance_adjustment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_encashment: {
        Row: {
          created_at: string
          id: string
          leave_type_id: string
          period: string
          period_end: string
          settlement_id: string | null
          staff_id: string
          status: string
          units: number
        }
        Insert: {
          created_at?: string
          id?: string
          leave_type_id: string
          period: string
          period_end: string
          settlement_id?: string | null
          staff_id: string
          status?: string
          units: number
        }
        Update: {
          created_at?: string
          id?: string
          leave_type_id?: string
          period?: string
          period_end?: string
          settlement_id?: string | null
          staff_id?: string
          status?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_encashment_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_encashment_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "salary_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_encashment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_encashment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deduction_days: number
          holiday_group_id: string | null
          id: string
          is_immutable: boolean
          leave_date: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          leave_type_id: string | null
          rejection_reason: string | null
          remarks: string | null
          staff_id: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deduction_days?: number
          holiday_group_id?: string | null
          id?: string
          is_immutable?: boolean
          leave_date: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          leave_type_id?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deduction_days?: number
          holiday_group_id?: string | null
          id?: string
          is_immutable?: boolean
          leave_date?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          leave_type_id?: string | null
          rejection_reason?: string | null
          remarks?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_records_holiday_group_id_fkey"
            columns: ["holiday_group_id"]
            isOneToOne: false
            referencedRelation: "holiday_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_records_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_records_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_records_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_settings: {
        Row: {
          accrual: string
          annual_quota: number
          id: string
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accrual?: string
          annual_quota?: number
          id?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accrual?: string
          annual_quota?: number
          id?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leave_type_overrides: {
        Row: {
          carry_forward_override: boolean | null
          created_at: string
          deduction_override: number | null
          department_id: string | null
          id: string
          is_active: boolean
          is_exempt: boolean
          leave_type_id: string
          outlet_id: string | null
          quota_override: number | null
          role_type: string | null
          scope: string
        }
        Insert: {
          carry_forward_override?: boolean | null
          created_at?: string
          deduction_override?: number | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_exempt?: boolean
          leave_type_id: string
          outlet_id?: string | null
          quota_override?: number | null
          role_type?: string | null
          scope: string
        }
        Update: {
          carry_forward_override?: boolean | null
          created_at?: string
          deduction_override?: number | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          is_exempt?: boolean
          leave_type_id?: string
          outlet_id?: string | null
          quota_override?: number | null
          role_type?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_type_overrides_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_type_overrides_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_type_overrides_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          accrual: string
          auto_allocation_period: string
          carry_forward: boolean
          carry_forward_leaves: number
          carry_forward_period: string
          code: string
          created_at: string
          created_by: string | null
          default_deduction: number
          default_quota: number
          encashment_enabled: boolean
          encashment_limit: number | null
          encashment_period: string | null
          id: string
          is_active: boolean
          is_default: boolean
          is_paid: boolean
          max_balance: number | null
          name: string
          no_of_auto_allocation_leaves: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          accrual?: string
          auto_allocation_period?: string
          carry_forward?: boolean
          carry_forward_leaves?: number
          carry_forward_period?: string
          code: string
          created_at?: string
          created_by?: string | null
          default_deduction?: number
          default_quota?: number
          encashment_enabled?: boolean
          encashment_limit?: number | null
          encashment_period?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_paid?: boolean
          max_balance?: number | null
          name: string
          no_of_auto_allocation_leaves?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accrual?: string
          auto_allocation_period?: string
          carry_forward?: boolean
          carry_forward_leaves?: number
          carry_forward_period?: string
          code?: string
          created_at?: string
          created_by?: string | null
          default_deduction?: number
          default_quota?: number
          encashment_enabled?: boolean
          encashment_limit?: number | null
          encashment_period?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_paid?: boolean
          max_balance?: number | null
          name?: string
          no_of_auto_allocation_leaves?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          credit: number | null
          debit: number | null
          description: string
          entry_date: string
          id: string
          is_immutable: boolean | null
          is_legacy: boolean | null
          paid_by: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"] | null
          reference_month: string | null
          running_balance: number | null
          staff_id: string
          tag: string | null
          updated_at: string
          voucher_no: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description: string
          entry_date?: string
          id?: string
          is_immutable?: boolean | null
          is_legacy?: boolean | null
          paid_by?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          reference_month?: string | null
          running_balance?: number | null
          staff_id: string
          tag?: string | null
          updated_at?: string
          voucher_no: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description?: string
          entry_date?: string
          id?: string
          is_immutable?: boolean | null
          is_legacy?: boolean | null
          paid_by?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"] | null
          reference_month?: string | null
          running_balance?: number | null
          staff_id?: string
          tag?: string | null
          updated_at?: string
          voucher_no?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      login_reset_requests: {
        Row: {
          created_at: string
          id: string
          reason: string
          rejection_reason: string | null
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          rejection_reason?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          rejection_reason?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_reset_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_reset_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_profile: {
        Row: {
          address: string | null
          attendance_day_start_hour: number
          brand_code: string | null
          breaks_enabled: boolean
          city: string | null
          created_at: string
          email: string | null
          epf_number: string | null
          esi_number: string | null
          gstin: string | null
          id: string
          leave_year_start_month: number
          legal_name: string | null
          logo_url: string | null
          onboarded_at: string | null
          pan: string | null
          phone: string | null
          pincode: string | null
          self_checkin_enabled: boolean
          singleton: boolean
          state: string | null
          trade_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          attendance_day_start_hour?: number
          brand_code?: string | null
          breaks_enabled?: boolean
          city?: string | null
          created_at?: string
          email?: string | null
          epf_number?: string | null
          esi_number?: string | null
          gstin?: string | null
          id?: string
          leave_year_start_month?: number
          legal_name?: string | null
          logo_url?: string | null
          onboarded_at?: string | null
          pan?: string | null
          phone?: string | null
          pincode?: string | null
          self_checkin_enabled?: boolean
          singleton?: boolean
          state?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          attendance_day_start_hour?: number
          brand_code?: string | null
          breaks_enabled?: boolean
          city?: string | null
          created_at?: string
          email?: string | null
          epf_number?: string | null
          esi_number?: string | null
          gstin?: string | null
          id?: string
          leave_year_start_month?: number
          legal_name?: string | null
          logo_url?: string | null
          onboarded_at?: string | null
          pan?: string | null
          phone?: string | null
          pincode?: string | null
          self_checkin_enabled?: boolean
          singleton?: boolean
          state?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      outlets: {
        Row: {
          address: string | null
          allowed_radius_meters: number | null
          code: string | null
          created_at: string
          created_by: string | null
          geofence_enforcement: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          allowed_radius_meters?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          geofence_enforcement?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          allowed_radius_meters?: number | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          geofence_enforcement?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          approved_by_user_name: string | null
          created_at: string
          id: string
          ledger_entry_id: string | null
          paid_at: string | null
          paid_by: string | null
          paid_by_user_name: string | null
          payout_type: string | null
          reason: string
          rejection_reason: string | null
          requested_by: string
          settlement_id: string | null
          staff_id: string
          status: Database["public"]["Enums"]["request_status"] | null
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_user_name?: string | null
          created_at?: string
          id?: string
          ledger_entry_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_user_name?: string | null
          payout_type?: string | null
          reason: string
          rejection_reason?: string | null
          requested_by: string
          settlement_id?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["request_status"] | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_user_name?: string | null
          created_at?: string
          id?: string
          ledger_entry_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_user_name?: string | null
          payout_type?: string | null
          reason?: string
          rejection_reason?: string | null
          requested_by?: string
          settlement_id?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["request_status"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "salary_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_statutory_settings: {
        Row: {
          esi_calc_base: string
          esi_eligibility_ceiling: number
          esi_employer_rate: number
          esi_enabled: boolean
          id: string
          ot_enabled: boolean
          ot_multiplier: number
          ot_standard_minutes: number
          pf_base_cap: number
          pf_calc_base: string
          pf_default_enroll: boolean
          pf_employee_rate: number
          pf_employer_rate: number
          pf_enabled: boolean
          pt_enabled: boolean
          pt_min_gross: number
          pt_monthly_amount: number
          pt_slabs: Json
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          esi_calc_base?: string
          esi_eligibility_ceiling?: number
          esi_employer_rate?: number
          esi_enabled?: boolean
          id?: string
          ot_enabled?: boolean
          ot_multiplier?: number
          ot_standard_minutes?: number
          pf_base_cap?: number
          pf_calc_base?: string
          pf_default_enroll?: boolean
          pf_employee_rate?: number
          pf_employer_rate?: number
          pf_enabled?: boolean
          pt_enabled?: boolean
          pt_min_gross?: number
          pt_monthly_amount?: number
          pt_slabs?: Json
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          esi_calc_base?: string
          esi_eligibility_ceiling?: number
          esi_employer_rate?: number
          esi_enabled?: boolean
          id?: string
          ot_enabled?: boolean
          ot_multiplier?: number
          ot_standard_minutes?: number
          pf_base_cap?: number
          pf_calc_base?: string
          pf_default_enroll?: boolean
          pf_employee_rate?: number
          pf_employer_rate?: number
          pf_enabled?: boolean
          pt_enabled?: boolean
          pt_min_gross?: number
          pt_monthly_amount?: number
          pt_slabs?: Json
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          key: string
          label: string
          module: string
          sort_order: number
        }
        Insert: {
          key: string
          label: string
          module: string
          sort_order?: number
        }
        Update: {
          key?: string
          label?: string
          module?: string
          sort_order?: number
        }
        Relationships: []
      }
      punch_events: {
        Row: {
          created_at: string
          device_id: string | null
          direction: string
          geo: Json | null
          id: string
          method: string
          outlet_id: string | null
          raw_ref: string | null
          session_id: string | null
          staff_id: string
          ts: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          direction: string
          geo?: Json | null
          id?: string
          method?: string
          outlet_id?: string | null
          raw_ref?: string | null
          session_id?: string | null
          staff_id: string
          ts: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          direction?: string
          geo?: Json | null
          id?: string
          method?: string
          outlet_id?: string | null
          raw_ref?: string | null
          session_id?: string | null
          staff_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "biometric_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rights_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_builtin: boolean
          is_owner: boolean
          name: string
          permissions: string[]
          role_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          is_owner?: boolean
          name: string
          permissions?: string[]
          role_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          is_owner?: boolean
          name?: string
          permissions?: string[]
          role_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      salary_arrears: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          period_label: string | null
          reason: string
          settled_at: string | null
          settlement_id: string | null
          settlement_month: string
          staff_id: string
          status: string
          updated_at: string
          written_off_at: string | null
          written_off_by: string | null
          written_off_reason: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_label?: string | null
          reason: string
          settled_at?: string | null
          settlement_id?: string | null
          settlement_month: string
          staff_id: string
          status?: string
          updated_at?: string
          written_off_at?: string | null
          written_off_by?: string | null
          written_off_reason?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          period_label?: string | null
          reason?: string
          settled_at?: string | null
          settlement_id?: string | null
          settlement_month?: string
          staff_id?: string
          status?: string
          updated_at?: string
          written_off_at?: string | null
          written_off_by?: string | null
          written_off_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_arrears_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "salary_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_arrears_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_arrears_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          monthly_salary: number
          staff_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          monthly_salary: number
          staff_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          monthly_salary?: number
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_settlement_loan_deductions: {
        Row: {
          amount: number
          created_at: string
          id: string
          loan_id: string
          settlement_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          loan_id: string
          settlement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          loan_id?: string
          settlement_id?: string
        }
        Relationships: []
      }
      salary_settlements: {
        Row: {
          absent_days: number | null
          absent_days_override: number | null
          absent_deduction: number | null
          absent_deduction_days: number | null
          advances_adjusted: number | null
          arrears: number
          balance_payable: number
          base_salary: number
          bonus: number
          closing_advance_balance: number | null
          comp_off_earned: number | null
          created_at: string
          created_by: string | null
          deduction_adjusted_at: string | null
          deduction_adjusted_by: string | null
          deduction_adjustment_reason: string | null
          discipline_fine: number
          earnings_allowances: number
          earnings_basic: number
          earnings_hra: number
          esi_base: number | null
          esi_employee: number
          esi_employer: number
          esi_rate_employee: number | null
          esi_rate_employer: number | null
          final_deduction_days: number | null
          half_days: number | null
          id: string
          incentives: number
          journal_entry_id: string | null
          leave_days: number | null
          leave_deduction: number | null
          ledger_entry_id: string | null
          loan_emi_total: number
          net_salary: number
          off_days: number | null
          opening_advance_balance: number | null
          overtime_amount: number
          overtime_auto: number
          overtime_override_reason: string | null
          paid_at: string | null
          paid_by: string | null
          paid_by_user_name: string | null
          paid_leave_days: number | null
          payment_mode: string | null
          payout_journal_entry_id: string | null
          pf_base: number | null
          pf_employee: number
          pf_employer: number
          pf_rate_employee: number | null
          pf_rate_employer: number | null
          present_days: number | null
          pt_amount: number
          settled_at: string | null
          settled_by: string | null
          settlement_month: string
          staff_id: string
          status: Database["public"]["Enums"]["settlement_status"] | null
          system_deduction_days: number | null
          updated_at: string
        }
        Insert: {
          absent_days?: number | null
          absent_days_override?: number | null
          absent_deduction?: number | null
          absent_deduction_days?: number | null
          advances_adjusted?: number | null
          arrears?: number
          balance_payable: number
          base_salary: number
          bonus?: number
          closing_advance_balance?: number | null
          comp_off_earned?: number | null
          created_at?: string
          created_by?: string | null
          deduction_adjusted_at?: string | null
          deduction_adjusted_by?: string | null
          deduction_adjustment_reason?: string | null
          discipline_fine?: number
          earnings_allowances?: number
          earnings_basic?: number
          earnings_hra?: number
          esi_base?: number | null
          esi_employee?: number
          esi_employer?: number
          esi_rate_employee?: number | null
          esi_rate_employer?: number | null
          final_deduction_days?: number | null
          half_days?: number | null
          id?: string
          incentives?: number
          journal_entry_id?: string | null
          leave_days?: number | null
          leave_deduction?: number | null
          ledger_entry_id?: string | null
          loan_emi_total?: number
          net_salary: number
          off_days?: number | null
          opening_advance_balance?: number | null
          overtime_amount?: number
          overtime_auto?: number
          overtime_override_reason?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_user_name?: string | null
          paid_leave_days?: number | null
          payment_mode?: string | null
          payout_journal_entry_id?: string | null
          pf_base?: number | null
          pf_employee?: number
          pf_employer?: number
          pf_rate_employee?: number | null
          pf_rate_employer?: number | null
          present_days?: number | null
          pt_amount?: number
          settled_at?: string | null
          settled_by?: string | null
          settlement_month: string
          staff_id: string
          status?: Database["public"]["Enums"]["settlement_status"] | null
          system_deduction_days?: number | null
          updated_at?: string
        }
        Update: {
          absent_days?: number | null
          absent_days_override?: number | null
          absent_deduction?: number | null
          absent_deduction_days?: number | null
          advances_adjusted?: number | null
          arrears?: number
          balance_payable?: number
          base_salary?: number
          bonus?: number
          closing_advance_balance?: number | null
          comp_off_earned?: number | null
          created_at?: string
          created_by?: string | null
          deduction_adjusted_at?: string | null
          deduction_adjusted_by?: string | null
          deduction_adjustment_reason?: string | null
          discipline_fine?: number
          earnings_allowances?: number
          earnings_basic?: number
          earnings_hra?: number
          esi_base?: number | null
          esi_employee?: number
          esi_employer?: number
          esi_rate_employee?: number | null
          esi_rate_employer?: number | null
          final_deduction_days?: number | null
          half_days?: number | null
          id?: string
          incentives?: number
          journal_entry_id?: string | null
          leave_days?: number | null
          leave_deduction?: number | null
          ledger_entry_id?: string | null
          loan_emi_total?: number
          net_salary?: number
          off_days?: number | null
          opening_advance_balance?: number | null
          overtime_amount?: number
          overtime_auto?: number
          overtime_override_reason?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_user_name?: string | null
          paid_leave_days?: number | null
          payment_mode?: string | null
          payout_journal_entry_id?: string | null
          pf_base?: number | null
          pf_employee?: number
          pf_employer?: number
          pf_rate_employee?: number | null
          pf_rate_employer?: number | null
          present_days?: number | null
          pt_amount?: number
          settled_at?: string | null
          settled_by?: string | null
          settlement_month?: string
          staff_id?: string
          status?: Database["public"]["Enums"]["settlement_status"] | null
          system_deduction_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_settlements_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_settlements_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_settlements_payout_journal_entry_id_fkey"
            columns: ["payout_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_settlements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_settlements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_sheet_locks: {
        Row: {
          id: string
          locked_at: string
          locked_by: string
          month: string
        }
        Insert: {
          id?: string
          locked_at?: string
          locked_by: string
          month: string
        }
        Update: {
          id?: string
          locked_at?: string
          locked_by?: string
          month?: string
        }
        Relationships: []
      }
      saved_reports: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          name: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: Json
          id?: string
          name: string
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          name?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_assignment: {
        Row: {
          created_at: string
          id: string
          shift_id: string | null
          staff_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          shift_id?: string | null
          staff_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          shift_id?: string | null
          staff_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignment_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignment_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_day_timing: {
        Row: {
          break_end: string | null
          break_start: string | null
          end_time: string | null
          id: string
          shift_id: string
          start_time: string | null
          weekday: number
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          end_time?: string | null
          id?: string
          shift_id: string
          start_time?: string | null
          weekday: number
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          end_time?: string | null
          id?: string
          shift_id?: string
          start_time?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_day_timing_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          alias: string | null
          check_in_time: string
          check_out_time: string
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          has_break: boolean
          id: string
          is_active: boolean
          is_one_time_all_days: boolean
          is_open: boolean
          name: string
          updated_at: string
        }
        Insert: {
          alias?: string | null
          check_in_time: string
          check_out_time: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_break?: boolean
          id?: string
          is_active?: boolean
          is_one_time_all_days?: boolean
          is_open?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          alias?: string | null
          check_in_time?: string
          check_out_time?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_break?: boolean
          id?: string
          is_active?: boolean
          is_one_time_all_days?: boolean
          is_open?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          aadhaar_number: string | null
          address: string | null
          attendance_tracked: boolean
          bank_account_name: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          basic_salary: number
          blood_group: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          date_of_joining: string
          date_of_leaving: string | null
          department: string | null
          department_id: string | null
          designation: string | null
          designation_id: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_id: string
          esi_employee_rate: number | null
          esi_enrolled: boolean
          esic_number: string | null
          full_name: string
          gender: string | null
          hra: number
          id: string
          is_active: boolean | null
          is_manager: boolean
          location: string | null
          monthly_salary: number
          onboarding_completed: boolean
          ot_multiplier_override: number | null
          ot_standard_minutes_override: number | null
          other_allowances: number
          outlet_id: string | null
          pan_number: string | null
          pf_employee_rate_override: number | null
          pf_enrolled: boolean
          phone: string | null
          photo_url: string | null
          preferred_language: string | null
          pt_exempt: boolean
          remote_attendance_allowed: boolean
          reporting_manager_id: string | null
          salary_review_last_notified_at: string | null
          self_checkin_allowed: boolean
          separation_reason: string | null
          status: string
          uan_number: string | null
          updated_at: string
          user_id: string | null
          weekly_off_day: number | null
        }
        Insert: {
          aadhaar_number?: string | null
          address?: string | null
          attendance_tracked?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          basic_salary?: number
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          date_of_joining?: string
          date_of_leaving?: string | null
          department?: string | null
          department_id?: string | null
          designation?: string | null
          designation_id?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id: string
          esi_employee_rate?: number | null
          esi_enrolled?: boolean
          esic_number?: string | null
          full_name: string
          gender?: string | null
          hra?: number
          id?: string
          is_active?: boolean | null
          is_manager?: boolean
          location?: string | null
          monthly_salary?: number
          onboarding_completed?: boolean
          ot_multiplier_override?: number | null
          ot_standard_minutes_override?: number | null
          other_allowances?: number
          outlet_id?: string | null
          pan_number?: string | null
          pf_employee_rate_override?: number | null
          pf_enrolled?: boolean
          phone?: string | null
          photo_url?: string | null
          preferred_language?: string | null
          pt_exempt?: boolean
          remote_attendance_allowed?: boolean
          reporting_manager_id?: string | null
          salary_review_last_notified_at?: string | null
          self_checkin_allowed?: boolean
          separation_reason?: string | null
          status?: string
          uan_number?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_off_day?: number | null
        }
        Update: {
          aadhaar_number?: string | null
          address?: string | null
          attendance_tracked?: boolean
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          basic_salary?: number
          blood_group?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          date_of_joining?: string
          date_of_leaving?: string | null
          department?: string | null
          department_id?: string | null
          designation?: string | null
          designation_id?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id?: string
          esi_employee_rate?: number | null
          esi_enrolled?: boolean
          esic_number?: string | null
          full_name?: string
          gender?: string | null
          hra?: number
          id?: string
          is_active?: boolean | null
          is_manager?: boolean
          location?: string | null
          monthly_salary?: number
          onboarding_completed?: boolean
          ot_multiplier_override?: number | null
          ot_standard_minutes_override?: number | null
          other_allowances?: number
          outlet_id?: string | null
          pan_number?: string | null
          pf_employee_rate_override?: number | null
          pf_enrolled?: boolean
          phone?: string | null
          photo_url?: string | null
          preferred_language?: string | null
          pt_exempt?: boolean
          remote_attendance_allowed?: boolean
          reporting_manager_id?: string | null
          salary_review_last_notified_at?: string | null
          self_checkin_allowed?: boolean
          separation_reason?: string | null
          status?: string
          uan_number?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_off_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          created_at: string
          doc_label: string | null
          doc_number: string | null
          doc_type: Database["public"]["Enums"]["staff_document_type"]
          file_name: string | null
          file_url: string
          id: string
          notes: string | null
          staff_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_label?: string | null
          doc_number?: string | null
          doc_type?: Database["public"]["Enums"]["staff_document_type"]
          file_name?: string | null
          file_url: string
          id?: string
          notes?: string | null
          staff_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_label?: string | null
          doc_number?: string | null
          doc_type?: Database["public"]["Enums"]["staff_document_type"]
          file_name?: string | null
          file_url?: string
          id?: string
          notes?: string | null
          staff_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      staff_loans: {
        Row: {
          created_at: string
          created_by: string | null
          emi_amount: number
          id: string
          loan_type: string
          name: string | null
          notes: string | null
          principal: number
          remaining_balance: number
          staff_id: string
          start_month: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          emi_amount: number
          id?: string
          loan_type?: string
          name?: string | null
          notes?: string | null
          principal: number
          remaining_balance: number
          staff_id: string
          start_month: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          emi_amount?: number
          id?: string
          loan_type?: string
          name?: string | null
          notes?: string | null
          principal?: number
          remaining_balance?: number
          staff_id?: string
          start_month?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_roster: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_off: boolean
          note: string | null
          roster_date: string
          shift_id: string | null
          source: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_off?: boolean
          note?: string | null
          roster_date: string
          shift_id?: string | null
          source?: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_off?: boolean
          note?: string | null
          roster_date?: string
          shift_id?: string | null
          source?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_roster_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roster_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_roster_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shift_assignments: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          override_check_in: string | null
          override_check_out: string | null
          shift_id: string | null
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          id?: string
          override_check_in?: string | null
          override_check_out?: string | null
          shift_id?: string | null
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          override_check_in?: string | null
          override_check_out?: string | null
          shift_id?: string | null
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: string[]
          revoked: string[]
          template_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: string[]
          revoked?: string[]
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: string[]
          revoked?: string[]
          template_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rights_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      week_off: {
        Row: {
          created_at: string
          id: string
          staff_id: string
          state: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          staff_id: string
          state?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          staff_id?: string
          state?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "week_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notification_log: {
        Row: {
          deduction_amount: number
          error_message: string | null
          event_type: string
          id: string
          meta_message_id: string | null
          sent_at: string
          slab: string
          staff_id: string | null
          staff_phone: string
          success: boolean
          template_name: string
        }
        Insert: {
          deduction_amount?: number
          error_message?: string | null
          event_type: string
          id?: string
          meta_message_id?: string | null
          sent_at?: string
          slab: string
          staff_id?: string | null
          staff_phone: string
          success?: boolean
          template_name: string
        }
        Update: {
          deduction_amount?: number
          error_message?: string | null
          event_type?: string
          id?: string
          meta_message_id?: string | null
          sent_at?: string
          slab?: string
          staff_id?: string | null
          staff_phone?: string
          success?: boolean
          template_name?: string
        }
        Relationships: []
      }
      working_hour_config_history: {
        Row: {
          attendance_mode: string
          created_at: string
          created_by: string | null
          effective_from: string
          full_day_minutes: number
          half_day_minutes: number
          id: string
          is_shift_wise_work_hrs: boolean
        }
        Insert: {
          attendance_mode: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          full_day_minutes: number
          half_day_minutes: number
          id?: string
          is_shift_wise_work_hrs?: boolean
        }
        Update: {
          attendance_mode?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          full_day_minutes?: number
          half_day_minutes?: number
          id?: string
          is_shift_wise_work_hrs?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      staff_public: {
        Row: {
          created_at: string | null
          date_of_joining: string | null
          department: string | null
          designation: string | null
          email: string | null
          employee_id: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          date_of_joining?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_clear_transaction_data: {
        Args: { _date_from: string; _date_to: string; _owner_id: string }
        Returns: Json
      }
      apply_holiday_group: { Args: { _group_id: string }; Returns: Json }
      assert_finance_or_admin: { Args: never; Returns: undefined }
      assert_owner: { Args: never; Returns: undefined }
      assert_reporting_access: { Args: never; Returns: undefined }
      assert_staff_finance_access: {
        Args: { _staff_id: string }
        Returns: undefined
      }
      bulk_update_salaries: { Args: { _changes: Json }; Returns: Json }
      calculate_running_balance: {
        Args: { _staff_id: string }
        Returns: {
          entry_id: string
          running_balance: number
        }[]
      }
      can_view_salary: { Args: { _user_id: string }; Returns: boolean }
      complete_staff_onboarding: {
        Args: {
          _aadhaar: string
          _email: string
          _lang: string
          _pan: string
          _phone: string
        }
        Returns: undefined
      }
      consolidate_biometric_attendance: { Args: never; Returns: Json }
      create_notification: {
        Args: {
          _message: string
          _reference_id?: string
          _reference_type?: string
          _title: string
          _type?: string
          _user_id: string
        }
        Returns: string
      }
      current_user_outlet_id: { Args: never; Returns: string }
      etl_cron_status: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_end: string
          last_message: string
          last_start: string
          last_status: string
          schedule: string
        }[]
      }
      generate_journal_ref: {
        Args: { _transaction_type: string }
        Returns: string
      }
      generate_voucher_no: {
        Args: { _voucher_type: Database["public"]["Enums"]["voucher_type"] }
        Returns: string
      }
      get_account_id: { Args: { _code: string }; Returns: string }
      get_advances_outstanding: { Args: { _staff_id: string }; Returns: number }
      get_attendance_overview: {
        Args: { _date: string; _outlet?: string }
        Returns: Json
      }
      get_comp_off_earned_by_staff: {
        Args: { _year: number }
        Returns: {
          comp_off: number
          staff_id: string
        }[]
      }
      get_dashboard_stats: { Args: { _with_salary?: boolean }; Returns: Json }
      get_expense_account_code: {
        Args: { _category: Database["public"]["Enums"]["expense_category"] }
        Returns: string
      }
      get_leave_balances_overview: { Args: { _year?: number }; Returns: Json }
      get_monthly_leave_records: {
        Args: { _month: string; _staff_id: string }
        Returns: {
          deduction_days: number
          id: string
          leave_date: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          remarks: string
        }[]
      }
      get_my_permissions: { Args: never; Returns: string[] }
      get_payment_account_code: {
        Args: { _payment_mode: Database["public"]["Enums"]["payment_mode"] }
        Returns: string
      }
      get_reconciliation_status: {
        Args: { _month: string; _staff_id: string }
        Returns: Json
      }
      get_staff_advances_from_journals: {
        Args: { _staff_id: string }
        Returns: number
      }
      get_staff_advances_from_journals_bulk: {
        Args: { _staff_ids: string[] }
        Returns: {
          advances: number
          staff_id: string
        }[]
      }
      get_staff_journal_balance: {
        Args: { _staff_id: string }
        Returns: number
      }
      get_staff_ledger_opening: {
        Args: { _before: string; _staff_id?: string }
        Returns: {
          advance_credit: number
          advance_debit: number
          payable_credit: number
          payable_debit: number
          staff_id: string
        }[]
      }
      get_staff_payable_from_journals: {
        Args: { _staff_id: string }
        Returns: number
      }
      get_staff_salaries_for_month: {
        Args: { _month: string; _staff_ids: string[] }
        Returns: {
          salary: number
          staff_id: string
        }[]
      }
      get_staff_salary_for_month: {
        Args: { _month: string; _staff_id: string }
        Returns: number
      }
      get_system_deduction_days: {
        Args: { _month: string; _staff_id: string }
        Returns: number
      }
      get_trial_balance: {
        Args: never
        Returns: {
          account_code: string
          account_name: string
          account_type: string
          balance: number
          total_credit: number
          total_debit: number
        }[]
      }
      get_user_staff_id: { Args: { _user_id: string }; Returns: string }
      get_working_days_in_month: { Args: { _month: string }; Returns: number }
      has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_finance_user: { Args: { _user_id: string }; Returns: boolean }
      is_first_time_login: { Args: { _id: string }; Returns: boolean }
      is_leave_of_my_report: { Args: { _staff_id: string }; Returns: boolean }
      is_salary_settled: {
        Args: { _month: string; _staff_id: string }
        Returns: boolean
      }
      log_bulk_attendance_adjustment: {
        Args: { _action: string; _scope: Json }
        Returns: string
      }
      log_payroll_action: {
        Args: { _action: string; _scope: Json }
        Returns: string
      }
      manager_outlet_ok: { Args: { _staff_id: string }; Returns: boolean }
      notify_management: {
        Args: {
          _message: string
          _reference_id?: string
          _reference_type?: string
          _staff_id?: string
          _title: string
          _type?: string
        }
        Returns: undefined
      }
      notify_users: {
        Args: {
          _message: string
          _reference_id?: string
          _reference_type?: string
          _title: string
          _type?: string
          _user_ids: string[]
        }
        Returns: undefined
      }
      notify_users_by_role:
        | {
            Args: {
              _message: string
              _reference_id?: string
              _reference_type?: string
              _roles: Database["public"]["Enums"]["app_role"][]
              _title: string
              _type?: string
            }
            Returns: number
          }
        | {
            Args: {
              _exclude_self?: boolean
              _message: string
              _reference_id?: string
              _reference_type?: string
              _roles: Database["public"]["Enums"]["app_role"][]
              _title: string
              _type?: string
            }
            Returns: number
          }
      rebuild_sessions_by_gap: {
        Args: { _max_gap_min?: number }
        Returns: Json
      }
      remove_holiday_group: { Args: { _group_id: string }; Returns: Json }
      resolve_login_email: { Args: { _id: string }; Returns: string }
      run_leave_rollover: { Args: { _target_fy: number }; Returns: Json }
      set_etl_cron_secret: { Args: { p_secret: string }; Returns: undefined }
      shift_pattern_analysis: {
        Args: never
        Returns: {
          avg_worked_min: number
          cross_midnight_pct: number
          department: string
          employee_id: string
          full_name: string
          median_in_hour: number
          median_out_hour: number
          p25_in_hour: number
          p75_in_hour: number
          sessions: number
          single_punch_pct: number
        }[]
      }
      validate_settlement: {
        Args: { _month: string; _staff_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "accountant"
        | "staff"
        | "ca"
        | "admin"
        | "hr"
        | "manager"
      employment_event_type:
        | "promotion"
        | "transfer"
        | "salary_revision"
        | "role_change"
        | "other"
      expense_category:
        | "travel"
        | "food"
        | "logistics"
        | "equipment"
        | "office_supplies"
        | "communication"
        | "other"
      expense_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "reimbursed"
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "paid" | "unpaid" | "penalty" | "custom"
      payment_mode: "cash" | "upi" | "bank_transfer" | "cheque" | "petty_cash"
      petty_cash_transaction_type:
        | "opening_balance"
        | "top_up"
        | "expense_payment"
        | "advance_payment"
      request_status: "pending" | "approved" | "rejected"
      settlement_status: "pending" | "settled"
      staff_document_type:
        | "aadhaar"
        | "pan"
        | "bank_details"
        | "education"
        | "employment_contract"
        | "experience_certificate"
        | "other"
      voucher_type:
        | "payment"
        | "journal"
        | "settlement"
        | "advance"
        | "deduction"
        | "expense"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "owner",
        "accountant",
        "staff",
        "ca",
        "admin",
        "hr",
        "manager",
      ],
      employment_event_type: [
        "promotion",
        "transfer",
        "salary_revision",
        "role_change",
        "other",
      ],
      expense_category: [
        "travel",
        "food",
        "logistics",
        "equipment",
        "office_supplies",
        "communication",
        "other",
      ],
      expense_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "reimbursed",
      ],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["paid", "unpaid", "penalty", "custom"],
      payment_mode: ["cash", "upi", "bank_transfer", "cheque", "petty_cash"],
      petty_cash_transaction_type: [
        "opening_balance",
        "top_up",
        "expense_payment",
        "advance_payment",
      ],
      request_status: ["pending", "approved", "rejected"],
      settlement_status: ["pending", "settled"],
      staff_document_type: [
        "aadhaar",
        "pan",
        "bank_details",
        "education",
        "employment_contract",
        "experience_certificate",
        "other",
      ],
      voucher_type: [
        "payment",
        "journal",
        "settlement",
        "advance",
        "deduction",
        "expense",
      ],
    },
  },
} as const
