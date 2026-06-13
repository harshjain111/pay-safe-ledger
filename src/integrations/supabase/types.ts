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
      // --- biometric attendance subsystem (hand-added; regenerated on deploy) ---
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
        ]
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
        ]
      }
      custom_expense_categories: {
        Row: {
          created_at: string
          created_by: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
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
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          approved_by_user_name: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          description: string
          event_id: string | null
          expense_date: string
          id: string
          ledger_entry_id: string | null
          proof_url: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          reimbursed_by_user_name: string | null
          rejection_reason: string | null
          staff_id: string
          status: Database["public"]["Enums"]["expense_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_user_name?: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description: string
          event_id?: string | null
          expense_date?: string
          id?: string
          ledger_entry_id?: string | null
          proof_url?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursed_by_user_name?: string | null
          rejection_reason?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_user_name?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          description?: string
          event_id?: string | null
          expense_date?: string
          id?: string
          ledger_entry_id?: string | null
          proof_url?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursed_by_user_name?: string | null
          rejection_reason?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["expense_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_public"
            referencedColumns: ["id"]
          },
        ]
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
      leave_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deduction_days: number
          id: string
          is_immutable: boolean
          leave_date: string
          leave_type: Database["public"]["Enums"]["leave_type"]
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
          id?: string
          is_immutable?: boolean
          leave_date: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
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
          id?: string
          is_immutable?: boolean
          leave_date?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          rejection_reason?: string | null
          remarks?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
        }
        Relationships: [
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
      outlets: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
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
          esi_eligibility_ceiling: number
          esi_employer_rate: number
          esi_enabled: boolean
          id: string
          pf_base_cap: number
          pf_default_enroll: boolean
          pf_employee_rate: number
          pf_employer_rate: number
          pf_enabled: boolean
          pt_enabled: boolean
          pt_min_gross: number
          pt_monthly_amount: number
          ot_enabled: boolean
          ot_multiplier: number
          ot_standard_minutes: number
          pt_slabs: Json
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          esi_eligibility_ceiling?: number
          esi_employer_rate?: number
          esi_enabled?: boolean
          id?: string
          pf_base_cap?: number
          pf_default_enroll?: boolean
          pf_employee_rate?: number
          pf_employer_rate?: number
          pf_enabled?: boolean
          pt_enabled?: boolean
          pt_min_gross?: number
          pt_monthly_amount?: number
          ot_enabled?: boolean
          ot_multiplier?: number
          ot_standard_minutes?: number
          pt_slabs?: Json
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          esi_eligibility_ceiling?: number
          esi_employer_rate?: number
          esi_enabled?: boolean
          id?: string
          pf_base_cap?: number
          pf_default_enroll?: boolean
          pf_employee_rate?: number
          pf_employer_rate?: number
          pf_enabled?: boolean
          pt_enabled?: boolean
          pt_min_gross?: number
          pt_monthly_amount?: number
          ot_enabled?: boolean
          ot_multiplier?: number
          ot_standard_minutes?: number
          pt_slabs?: Json
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      petty_cash_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string
          id: string
          notes: string | null
          reference_id: string | null
          reference_type: string | null
          source: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["petty_cash_transaction_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source?: string | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["petty_cash_transaction_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          source?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["petty_cash_transaction_type"]
        }
        Relationships: []
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
          advances_adjusted: number | null
          balance_payable: number
          base_salary: number
          bonus: number
          closing_advance_balance: number | null
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
          id: string
          incentives: number
          journal_entry_id: string | null
          leave_days: number | null
          leave_deduction: number | null
          ledger_entry_id: string | null
          loan_emi_total: number
          net_salary: number
          opening_advance_balance: number | null
          overtime_amount: number
          overtime_auto: number
          overtime_override_reason: string | null
          paid_at: string | null
          paid_by: string | null
          paid_by_user_name: string | null
          payment_mode: string | null
          payout_journal_entry_id: string | null
          pf_base: number | null
          pf_employee: number
          pf_employer: number
          pf_rate_employee: number | null
          pf_rate_employer: number | null
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
          advances_adjusted?: number | null
          balance_payable: number
          base_salary: number
          bonus?: number
          closing_advance_balance?: number | null
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
          id?: string
          incentives?: number
          journal_entry_id?: string | null
          leave_days?: number | null
          leave_deduction?: number | null
          ledger_entry_id?: string | null
          loan_emi_total?: number
          net_salary: number
          opening_advance_balance?: number | null
          overtime_amount?: number
          overtime_auto?: number
          overtime_override_reason?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_user_name?: string | null
          payment_mode?: string | null
          payout_journal_entry_id?: string | null
          pf_base?: number | null
          pf_employee?: number
          pf_employer?: number
          pf_rate_employee?: number | null
          pf_rate_employer?: number | null
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
          advances_adjusted?: number | null
          balance_payable?: number
          base_salary?: number
          bonus?: number
          closing_advance_balance?: number | null
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
          id?: string
          incentives?: number
          journal_entry_id?: string | null
          leave_days?: number | null
          leave_deduction?: number | null
          ledger_entry_id?: string | null
          loan_emi_total?: number
          net_salary?: number
          opening_advance_balance?: number | null
          overtime_amount?: number
          overtime_auto?: number
          overtime_override_reason?: string | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_user_name?: string | null
          payment_mode?: string | null
          payout_journal_entry_id?: string | null
          pf_base?: number | null
          pf_employee?: number
          pf_employer?: number
          pf_rate_employee?: number | null
          pf_rate_employer?: number | null
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
      shifts: {
        Row: {
          check_in_time: string
          check_out_time: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          check_in_time: string
          check_out_time: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          check_in_time?: string
          check_out_time?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
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
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_id: string
          esi_employee_rate: number | null
          esi_enrolled: boolean
          full_name: string
          gender: string | null
          hra: number
          id: string
          is_active: boolean | null
          location: string | null
          monthly_salary: number
          other_allowances: number
          outlet_id: string | null
          pf_employee_rate_override: number | null
          pf_enrolled: boolean
          phone: string | null
          photo_url: string | null
          pt_exempt: boolean
          reporting_manager_id: string | null
          updated_at: string
          user_id: string | null
          ot_multiplier_override: number | null
          ot_standard_minutes_override: number | null
          weekly_off_day: number | null
        }
        Insert: {
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
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id: string
          esi_employee_rate?: number | null
          esi_enrolled?: boolean
          full_name: string
          gender?: string | null
          hra?: number
          id?: string
          is_active?: boolean | null
          location?: string | null
          monthly_salary?: number
          other_allowances?: number
          pf_employee_rate_override?: number | null
          pf_enrolled?: boolean
          phone?: string | null
          photo_url?: string | null
          pt_exempt?: boolean
          reporting_manager_id?: string | null
          updated_at?: string
          user_id?: string | null
          ot_multiplier_override?: number | null
          ot_standard_minutes_override?: number | null
          weekly_off_day?: number | null
        }
        Update: {
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
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id?: string
          esi_employee_rate?: number | null
          esi_enrolled?: boolean
          full_name?: string
          gender?: string | null
          hra?: number
          id?: string
          is_active?: boolean | null
          location?: string | null
          monthly_salary?: number
          other_allowances?: number
          pf_employee_rate_override?: number | null
          pf_enrolled?: boolean
          phone?: string | null
          photo_url?: string | null
          pt_exempt?: boolean
          reporting_manager_id?: string | null
          updated_at?: string
          user_id?: string | null
          ot_multiplier_override?: number | null
          ot_standard_minutes_override?: number | null
          weekly_off_day?: number | null
        }
        Relationships: [
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
          staff_id: string
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
          staff_id: string
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
          staff_id?: string
          updated_at?: string
        }
        Relationships: []
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
      calculate_running_balance: {
        Args: { _staff_id: string }
        Returns: {
          entry_id: string
          running_balance: number
        }[]
      }
      can_view_salary: { Args: { _user_id: string }; Returns: boolean }
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
      get_comp_off_earned_by_staff: {
        Args: { _year: number }
        Returns: { comp_off: number; staff_id: string }[]
      }
      get_expense_account_code: {
        Args: { _category: Database["public"]["Enums"]["expense_category"] }
        Returns: string
      }
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
      get_payment_account_code: {
        Args: { _payment_mode: Database["public"]["Enums"]["payment_mode"] }
        Returns: string
      }
      get_petty_cash_balance: { Args: never; Returns: number }
      get_reconciliation_status: {
        Args: { _month: string; _staff_id: string }
        Returns: Json
      }
      get_staff_advances_from_journals: {
        Args: { _staff_id: string }
        Returns: number
      }
      get_staff_journal_balance: {
        Args: { _staff_id: string }
        Returns: number
      }
      get_staff_payable_from_journals: {
        Args: { _staff_id: string }
        Returns: number
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_finance_user: { Args: { _user_id: string }; Returns: boolean }
      is_salary_settled: {
        Args: { _month: string; _staff_id: string }
        Returns: boolean
      }
      notify_users_by_role: {
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
      validate_settlement: {
        Args: { _month: string; _staff_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "owner" | "accountant" | "staff" | "ca" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "accountant", "staff", "ca", "admin"],
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
