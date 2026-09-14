-- ---------------------------------------------------------------------------
-- RLS was costing 65x on the hot tables.
--
-- Every policy called auth.uid() inline, so Postgres re-evaluated it, and the
-- has_role() / has_permission() calls wrapped around it, once PER ROW. The
-- helpers are already STABLE, but that does not help while their argument is
-- recomputed for every row from current_setting().
--
-- Measured on attendance_sessions, 44,231 rows, as the owner:
--     without RLS     37 ms
--     with RLS     2,383 ms
--
-- The authenticated role has statement_timeout = 8s. One table already burned
-- a third of that budget, and the heavy screens -- the attendance matrix, a
-- payroll run -- read several such tables per page. That is the "no data, then
-- an error" the app was showing: queries crossing 8s come back as failures,
-- and a component with no rows renders its empty state before the error
-- surfaces.
--
-- The fix is Supabase's own documented one: wrap the call as
-- (SELECT auth.uid()) so the planner hoists it into an InitPlan and evaluates
-- it once per query instead of once per row.
--
-- This rewrites 218 policies across the public schema. Nothing about who can
-- see what changes -- each policy keeps its name, command, roles, USING and
-- WITH CHECK, with only the auth.uid() call wrapped. Every policy in the
-- schema is PERMISSIVE, so there is no restrictive interaction to preserve.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Accountants can view accounts" ON public.accounts;
CREATE POLICY "Accountants can view accounts" ON public.accounts
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins can view accounts" ON public.accounts;
CREATE POLICY "Admins can view accounts" ON public.accounts
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Finance users can view accounts" ON public.accounts;
CREATE POLICY "Finance users can view accounts" ON public.accounts
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((is_finance_user(( SELECT auth.uid() )) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "Owners can manage accounts" ON public.accounts;
CREATE POLICY "Owners can manage accounts" ON public.accounts
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "HR can manage attendance_breaks" ON public.attendance_breaks;
CREATE POLICY "HR can manage attendance_breaks" ON public.attendance_breaks
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers manage outlet attendance breaks" ON public.attendance_breaks;
CREATE POLICY "Managers manage outlet attendance breaks" ON public.attendance_breaks
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM (attendance_sessions a
     JOIN staff s ON ((s.id = a.staff_id)))
  WHERE ((a.id = attendance_breaks.session_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'manager'::app_role));

DROP POLICY IF EXISTS "Owners admins CA view all breaks" ON public.attendance_breaks;
CREATE POLICY "Owners admins CA view all breaks" ON public.attendance_breaks
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "Owners manage all breaks" ON public.attendance_breaks;
CREATE POLICY "Owners manage all breaks" ON public.attendance_breaks
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Users insert own breaks" ON public.attendance_breaks;
CREATE POLICY "Users insert own breaks" ON public.attendance_breaks
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM attendance_sessions s
  WHERE ((s.id = attendance_breaks.session_id) AND (s.user_id = ( SELECT auth.uid() ))))));

DROP POLICY IF EXISTS "Users select own breaks" ON public.attendance_breaks;
CREATE POLICY "Users select own breaks" ON public.attendance_breaks
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM attendance_sessions s
  WHERE ((s.id = attendance_breaks.session_id) AND (s.user_id = ( SELECT auth.uid() ))))));

DROP POLICY IF EXISTS "Users update own breaks" ON public.attendance_breaks;
CREATE POLICY "Users update own breaks" ON public.attendance_breaks
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM attendance_sessions s
  WHERE ((s.id = attendance_breaks.session_id) AND (s.user_id = ( SELECT auth.uid() ))))));

DROP POLICY IF EXISTS "Admins manage discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Admins manage discipline log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Finance roles view discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Finance roles view discipline log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "HR can manage attendance_discipline_log" ON public.attendance_discipline_log;
CREATE POLICY "HR can manage attendance_discipline_log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers manage outlet discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Managers manage outlet discipline log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = attendance_discipline_log.staff_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'manager'::app_role));

DROP POLICY IF EXISTS "Owners manage discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Owners manage discipline log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff view own discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Staff view own discipline log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Users insert own discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Users insert own discipline log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Users update own discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Users update own discipline log" ON public.attendance_discipline_log
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Manage attendance policies" ON public.attendance_policies;
CREATE POLICY "Manage attendance policies" ON public.attendance_policies
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'settings.attendance.edit'::text))
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'settings.attendance.edit'::text));

DROP POLICY IF EXISTS "Admins update attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Admins update attendance sessions" ON public.attendance_sessions
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Attendance managers manage sessions" ON public.attendance_sessions;
CREATE POLICY "Attendance managers manage sessions" ON public.attendance_sessions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_permission(( SELECT auth.uid() ), 'attendance.manage'::text) AND manager_outlet_ok(staff_id)))
  WITH CHECK ((has_permission(( SELECT auth.uid() ), 'attendance.manage'::text) AND manager_outlet_ok(staff_id)));

DROP POLICY IF EXISTS "HR can manage attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "HR can manage attendance_sessions" ON public.attendance_sessions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers manage outlet attendance" ON public.attendance_sessions;
CREATE POLICY "Managers manage outlet attendance" ON public.attendance_sessions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = attendance_sessions.staff_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = attendance_sessions.staff_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))));

DROP POLICY IF EXISTS "Owners admins CA view all attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Owners admins CA view all attendance sessions" ON public.attendance_sessions
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "Owners manage all attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Owners manage all attendance sessions" ON public.attendance_sessions
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Users insert own attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Users insert own attendance sessions" ON public.attendance_sessions
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK ((user_id = ( SELECT auth.uid() )));

DROP POLICY IF EXISTS "Users manage own attendance sessions select" ON public.attendance_sessions;
CREATE POLICY "Users manage own attendance sessions select" ON public.attendance_sessions
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((user_id = ( SELECT auth.uid() )) OR (staff_id IN ( SELECT s.id
   FROM staff s
  WHERE (s.user_id = ( SELECT auth.uid() ))))));

DROP POLICY IF EXISTS "Users update own attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Users update own attendance sessions" ON public.attendance_sessions
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((user_id = ( SELECT auth.uid() )));

DROP POLICY IF EXISTS "CA can view audit log" ON public.audit_log;
CREATE POLICY "CA can view audit log" ON public.audit_log
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'ca'::app_role));

DROP POLICY IF EXISTS "Owners can view audit log" ON public.audit_log;
CREATE POLICY "Owners can view audit log" ON public.audit_log
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "HR can manage biometric_devices" ON public.biometric_devices;
CREATE POLICY "HR can manage biometric_devices" ON public.biometric_devices
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners and admins manage devices" ON public.biometric_devices;
CREATE POLICY "Owners and admins manage devices" ON public.biometric_devices
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners and admins view devices" ON public.biometric_devices;
CREATE POLICY "Owners and admins view devices" ON public.biometric_devices
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners/admins manage biometric_devices" ON public.biometric_devices;
CREATE POLICY "Owners/admins manage biometric_devices" ON public.biometric_devices
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "HR can manage biometric_enrolments" ON public.biometric_enrolments;
CREATE POLICY "HR can manage biometric_enrolments" ON public.biometric_enrolments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Manage biometric_enrolments" ON public.biometric_enrolments;
CREATE POLICY "Manage biometric_enrolments" ON public.biometric_enrolments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage enrolments" ON public.biometric_enrolments;
CREATE POLICY "Owners and admins manage enrolments" ON public.biometric_enrolments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "View own or privileged enrolments" ON public.biometric_enrolments;
CREATE POLICY "View own or privileged enrolments" ON public.biometric_enrolments
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((staff_id = get_user_staff_id(( SELECT auth.uid() ))) OR has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "HR can manage departments" ON public.departments;
CREATE POLICY "HR can manage departments" ON public.departments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers manage departments" ON public.departments;
CREATE POLICY "Managers manage departments" ON public.departments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "Owners/admins manage departments" ON public.departments;
CREATE POLICY "Owners/admins manage departments" ON public.departments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "HR can manage designations" ON public.designations;
CREATE POLICY "HR can manage designations" ON public.designations
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers manage designations" ON public.designations;
CREATE POLICY "Managers manage designations" ON public.designations
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "Owners/admins manage designations" ON public.designations;
CREATE POLICY "Owners/admins manage designations" ON public.designations
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins manage discipline rules" ON public.discipline_rules;
CREATE POLICY "Admins manage discipline rules" ON public.discipline_rules
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated view discipline rules" ON public.discipline_rules;
CREATE POLICY "Authenticated view discipline rules" ON public.discipline_rules
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((( SELECT auth.uid() ) IS NOT NULL));

DROP POLICY IF EXISTS "HR can manage discipline_rules" ON public.discipline_rules;
CREATE POLICY "HR can manage discipline_rules" ON public.discipline_rules
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners manage discipline rules" ON public.discipline_rules;
CREATE POLICY "Owners manage discipline rules" ON public.discipline_rules
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Owners and admins manage holiday assignment" ON public.employee_holiday_template;
CREATE POLICY "Owners and admins manage holiday assignment" ON public.employee_holiday_template
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Reviewers and own staff read holiday assignment" ON public.employee_holiday_template;
CREATE POLICY "Reviewers and own staff read holiday assignment" ON public.employee_holiday_template
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR (staff_id = get_user_staff_id(( SELECT auth.uid() )))));

DROP POLICY IF EXISTS "HR can manage employee leave balances" ON public.employee_leave_balance;
CREATE POLICY "HR can manage employee leave balances" ON public.employee_leave_balance
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers view outlet employee leave balances" ON public.employee_leave_balance;
CREATE POLICY "Managers view outlet employee leave balances" ON public.employee_leave_balance
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = employee_leave_balance.staff_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))));

DROP POLICY IF EXISTS "Owners and admins manage leave balances" ON public.employee_leave_balance;
CREATE POLICY "Owners and admins manage leave balances" ON public.employee_leave_balance
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Reviewers and own staff read leave balances" ON public.employee_leave_balance;
CREATE POLICY "Reviewers and own staff read leave balances" ON public.employee_leave_balance
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR (staff_id = get_user_staff_id(( SELECT auth.uid() )))));

DROP POLICY IF EXISTS "Admins manage employment history" ON public.employment_history;
CREATE POLICY "Admins manage employment history" ON public.employment_history
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Finance roles view employment history" ON public.employment_history;
CREATE POLICY "Finance roles view employment history" ON public.employment_history
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "HR can manage employment_history" ON public.employment_history;
CREATE POLICY "HR can manage employment_history" ON public.employment_history
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners manage employment history" ON public.employment_history;
CREATE POLICY "Owners manage employment history" ON public.employment_history
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff view own employment history" ON public.employment_history;
CREATE POLICY "Staff view own employment history" ON public.employment_history
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Accountants can create events" ON public.events;
CREATE POLICY "Accountants can create events" ON public.events
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Accountants can view events" ON public.events;
CREATE POLICY "Accountants can view events" ON public.events
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins can create events" ON public.events;
CREATE POLICY "Admins can create events" ON public.events
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view events" ON public.events;
CREATE POLICY "Admins can view events" ON public.events
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "CA can view events" ON public.events;
CREATE POLICY "CA can view events" ON public.events
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'ca'::app_role));

DROP POLICY IF EXISTS "Owners can manage all events" ON public.events;
CREATE POLICY "Owners can manage all events" ON public.events
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff can view events" ON public.events;
CREATE POLICY "Staff can view events" ON public.events
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'staff'::app_role));

DROP POLICY IF EXISTS "Owners read grievances" ON public.grievances;
CREATE POLICY "Owners read grievances" ON public.grievances
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Owners update grievances" ON public.grievances;
CREATE POLICY "Owners update grievances" ON public.grievances
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "HR can manage holiday_assignments" ON public.holiday_assignments;
CREATE POLICY "HR can manage holiday_assignments" ON public.holiday_assignments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Manage holiday_assignments" ON public.holiday_assignments;
CREATE POLICY "Manage holiday_assignments" ON public.holiday_assignments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage holiday assignments" ON public.holiday_assignments;
CREATE POLICY "Owners and admins manage holiday assignments" ON public.holiday_assignments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Manage holiday_groups" ON public.holiday_groups;
CREATE POLICY "Manage holiday_groups" ON public.holiday_groups
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage holiday templates" ON public.holiday_template;
CREATE POLICY "Owners and admins manage holiday templates" ON public.holiday_template
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage holiday template days" ON public.holiday_template_days;
CREATE POLICY "Owners and admins manage holiday template days" ON public.holiday_template_days
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "HR can manage holidays" ON public.holidays;
CREATE POLICY "HR can manage holidays" ON public.holidays
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Manage holidays" ON public.holidays;
CREATE POLICY "Manage holidays" ON public.holidays
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage holidays" ON public.holidays;
CREATE POLICY "Owners and admins manage holidays" ON public.holidays
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "HR can manage hr_pay_rules" ON public.hr_pay_rules;
CREATE POLICY "HR can manage hr_pay_rules" ON public.hr_pay_rules
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Manage hr_pay_rules" ON public.hr_pay_rules;
CREATE POLICY "Manage hr_pay_rules" ON public.hr_pay_rules
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage pay rules" ON public.hr_pay_rules;
CREATE POLICY "Owners and admins manage pay rules" ON public.hr_pay_rules
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Accountants can view journal entries" ON public.journal_entries;
CREATE POLICY "Accountants can view journal entries" ON public.journal_entries
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins can view journal entries" ON public.journal_entries;
CREATE POLICY "Admins can view journal entries" ON public.journal_entries
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "CA can view journal entries" ON public.journal_entries;
CREATE POLICY "CA can view journal entries" ON public.journal_entries
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'ca'::app_role));

DROP POLICY IF EXISTS "Finance users can manage journal entries" ON public.journal_entries;
CREATE POLICY "Finance users can manage journal entries" ON public.journal_entries
  AS PERMISSIVE FOR ALL
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "Staff can view own journal entries" ON public.journal_entries;
CREATE POLICY "Staff can view own journal entries" ON public.journal_entries
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Accountants can view journal lines" ON public.journal_lines;
CREATE POLICY "Accountants can view journal lines" ON public.journal_lines
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins can view journal lines" ON public.journal_lines;
CREATE POLICY "Admins can view journal lines" ON public.journal_lines
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "CA can view journal lines" ON public.journal_lines;
CREATE POLICY "CA can view journal lines" ON public.journal_lines
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'ca'::app_role));

DROP POLICY IF EXISTS "Finance users can manage journal lines" ON public.journal_lines;
CREATE POLICY "Finance users can manage journal lines" ON public.journal_lines
  AS PERMISSIVE FOR ALL
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "Staff can view own journal lines" ON public.journal_lines;
CREATE POLICY "Staff can view own journal lines" ON public.journal_lines
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Owners, admins and HR write leave adjustments" ON public.leave_balance_adjustment;
CREATE POLICY "Owners, admins and HR write leave adjustments" ON public.leave_balance_adjustment
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'hr'::app_role)));

DROP POLICY IF EXISTS "Reviewers read leave adjustments" ON public.leave_balance_adjustment;
CREATE POLICY "Reviewers read leave adjustments" ON public.leave_balance_adjustment
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'hr'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage leave encashment" ON public.leave_encashment;
CREATE POLICY "Owners and admins manage leave encashment" ON public.leave_encashment
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Reviewers and own staff read leave encashment" ON public.leave_encashment;
CREATE POLICY "Reviewers and own staff read leave encashment" ON public.leave_encashment
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR (staff_id = get_user_staff_id(( SELECT auth.uid() )))));

DROP POLICY IF EXISTS "Accountants can insert leave records" ON public.leave_records;
CREATE POLICY "Accountants can insert leave records" ON public.leave_records
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Accountants can update leave records" ON public.leave_records;
CREATE POLICY "Accountants can update leave records" ON public.leave_records
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'accountant'::app_role) AND (is_immutable = false)));

DROP POLICY IF EXISTS "Accountants can view all leave records" ON public.leave_records;
CREATE POLICY "Accountants can view all leave records" ON public.leave_records
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins can insert leave records" ON public.leave_records;
CREATE POLICY "Admins can insert leave records" ON public.leave_records
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update leave records" ON public.leave_records;
CREATE POLICY "Admins can update leave records" ON public.leave_records
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'admin'::app_role) AND (is_immutable = false)));

DROP POLICY IF EXISTS "Admins can view all leave records" ON public.leave_records;
CREATE POLICY "Admins can view all leave records" ON public.leave_records
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "CA can view leave records" ON public.leave_records;
CREATE POLICY "CA can view leave records" ON public.leave_records
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'ca'::app_role));

DROP POLICY IF EXISTS "HR can manage leave_records" ON public.leave_records;
CREATE POLICY "HR can manage leave_records" ON public.leave_records
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers approve outlet leave" ON public.leave_records;
CREATE POLICY "Managers approve outlet leave" ON public.leave_records
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = leave_records.staff_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'manager'::app_role));

DROP POLICY IF EXISTS "Managers view outlet leave" ON public.leave_records;
CREATE POLICY "Managers view outlet leave" ON public.leave_records
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = leave_records.staff_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))));

DROP POLICY IF EXISTS "Owners can manage all leave records" ON public.leave_records;
CREATE POLICY "Owners can manage all leave records" ON public.leave_records
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff can create own leave requests" ON public.leave_records;
CREATE POLICY "Staff can create own leave requests" ON public.leave_records
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (((staff_id = get_user_staff_id(( SELECT auth.uid() ))) AND (status = 'pending'::leave_status)));

DROP POLICY IF EXISTS "Staff can update own pending leave" ON public.leave_records;
CREATE POLICY "Staff can update own pending leave" ON public.leave_records
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (((staff_id = get_user_staff_id(( SELECT auth.uid() ))) AND (status = 'pending'::leave_status) AND (is_immutable = false)));

DROP POLICY IF EXISTS "Staff can view own leave records" ON public.leave_records;
CREATE POLICY "Staff can view own leave records" ON public.leave_records
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "HR can manage leave_settings" ON public.leave_settings;
CREATE POLICY "HR can manage leave_settings" ON public.leave_settings
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Manage leave_settings" ON public.leave_settings;
CREATE POLICY "Manage leave_settings" ON public.leave_settings
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners and admins manage leave settings" ON public.leave_settings;
CREATE POLICY "Owners and admins manage leave settings" ON public.leave_settings
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Manage leave_type_overrides" ON public.leave_type_overrides;
CREATE POLICY "Manage leave_type_overrides" ON public.leave_type_overrides
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "HR can manage leave_types" ON public.leave_types;
CREATE POLICY "HR can manage leave_types" ON public.leave_types
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners and admins manage leave types" ON public.leave_types;
CREATE POLICY "Owners and admins manage leave types" ON public.leave_types
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Owners/admins manage leave_types" ON public.leave_types;
CREATE POLICY "Owners/admins manage leave_types" ON public.leave_types
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Accountants can insert non-salary ledger entries" ON public.ledger_entries;
CREATE POLICY "Accountants can insert non-salary ledger entries" ON public.ledger_entries
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'accountant'::app_role) AND (voucher_type <> 'settlement'::voucher_type)));

DROP POLICY IF EXISTS "Accountants can view ledger entries" ON public.ledger_entries;
CREATE POLICY "Accountants can view ledger entries" ON public.ledger_entries
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins can insert non-salary ledger entries" ON public.ledger_entries;
CREATE POLICY "Admins can insert non-salary ledger entries" ON public.ledger_entries
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'admin'::app_role) AND (voucher_type <> 'settlement'::voucher_type)));

DROP POLICY IF EXISTS "Admins can view ledger entries" ON public.ledger_entries;
CREATE POLICY "Admins can view ledger entries" ON public.ledger_entries
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "CA can view all ledger entries" ON public.ledger_entries;
CREATE POLICY "CA can view all ledger entries" ON public.ledger_entries
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'ca'::app_role));

DROP POLICY IF EXISTS "Owners can manage all ledger entries" ON public.ledger_entries;
CREATE POLICY "Owners can manage all ledger entries" ON public.ledger_entries
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff can view own ledger entries" ON public.ledger_entries;
CREATE POLICY "Staff can view own ledger entries" ON public.ledger_entries
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Owners review login resets" ON public.login_reset_requests;
CREATE POLICY "Owners review login resets" ON public.login_reset_requests
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Reviewers and owner read login resets" ON public.login_reset_requests;
CREATE POLICY "Reviewers and owner read login resets" ON public.login_reset_requests
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR (staff_id = get_user_staff_id(( SELECT auth.uid() )))));

DROP POLICY IF EXISTS "Staff self or managers raise login resets" ON public.login_reset_requests;
CREATE POLICY "Staff self or managers raise login resets" ON public.login_reset_requests
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (((requested_by = ( SELECT auth.uid() )) AND ((staff_id = get_user_staff_id(( SELECT auth.uid() ))) OR has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role))));

DROP POLICY IF EXISTS "Privileged users can insert notifications" ON public.notifications;
CREATE POLICY "Privileged users can insert notifications" ON public.notifications
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((user_id = ( SELECT auth.uid() )));

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((user_id = ( SELECT auth.uid() )));

DROP POLICY IF EXISTS "Manage organization profile" ON public.organization_profile;
CREATE POLICY "Manage organization profile" ON public.organization_profile
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'settings.organisation.edit'::text))
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'settings.organisation.edit'::text));

DROP POLICY IF EXISTS "HR can manage outlets" ON public.outlets;
CREATE POLICY "HR can manage outlets" ON public.outlets
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers manage outlets" ON public.outlets;
CREATE POLICY "Managers manage outlets" ON public.outlets
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "Owners/admins manage outlets" ON public.outlets;
CREATE POLICY "Owners/admins manage outlets" ON public.outlets
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Accountants can create and view payment requests" ON public.payment_requests;
CREATE POLICY "Accountants can create and view payment requests" ON public.payment_requests
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Accountants can insert payment requests" ON public.payment_requests;
CREATE POLICY "Accountants can insert payment requests" ON public.payment_requests
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Accountants can update payment requests for payout" ON public.payment_requests;
CREATE POLICY "Accountants can update payment requests for payout" ON public.payment_requests
  AS PERMISSIVE FOR UPDATE
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'accountant'::app_role) AND (status = 'approved'::request_status)))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins can insert payment requests" ON public.payment_requests;
CREATE POLICY "Admins can insert payment requests" ON public.payment_requests
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update payment requests" ON public.payment_requests;
CREATE POLICY "Admins can update payment requests" ON public.payment_requests
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can view all payment requests" ON public.payment_requests;
CREATE POLICY "Admins can view all payment requests" ON public.payment_requests
  AS PERMISSIVE FOR SELECT
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Owners can manage all payment requests" ON public.payment_requests;
CREATE POLICY "Owners can manage all payment requests" ON public.payment_requests
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Owners can view salary payout requests" ON public.payment_requests;
CREATE POLICY "Owners can view salary payout requests" ON public.payment_requests
  AS PERMISSIVE FOR SELECT
  TO public
  USING (((payout_type = 'salary'::text) AND has_role(( SELECT auth.uid() ), 'owner'::app_role)));

DROP POLICY IF EXISTS "Staff can insert own payment requests" ON public.payment_requests;
CREATE POLICY "Staff can insert own payment requests" ON public.payment_requests
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Staff can view and create own payment requests" ON public.payment_requests;
CREATE POLICY "Staff can view and create own payment requests" ON public.payment_requests
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Permission manage statutory settings" ON public.payroll_statutory_settings;
CREATE POLICY "Permission manage statutory settings" ON public.payroll_statutory_settings
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'settings.payroll.edit'::text))
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'settings.payroll.edit'::text));

DROP POLICY IF EXISTS "Owners manage punch events" ON public.punch_events;
CREATE POLICY "Owners manage punch events" ON public.punch_events
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Privileged view punch events" ON public.punch_events;
CREATE POLICY "Privileged view punch events" ON public.punch_events
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "Manage rights templates" ON public.rights_templates;
CREATE POLICY "Manage rights templates" ON public.rights_templates
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'users.manage'::text))
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'users.manage'::text));

DROP POLICY IF EXISTS "Manage rights_templates" ON public.rights_templates;
CREATE POLICY "Manage rights_templates" ON public.rights_templates
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Manage salary_arrears" ON public.salary_arrears;
CREATE POLICY "Manage salary_arrears" ON public.salary_arrears
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Payroll managers manage arrears" ON public.salary_arrears;
CREATE POLICY "Payroll managers manage arrears" ON public.salary_arrears
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'settings.payroll.edit'::text))
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'settings.payroll.edit'::text));

DROP POLICY IF EXISTS "View own or finance arrears" ON public.salary_arrears;
CREATE POLICY "View own or finance arrears" ON public.salary_arrears
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((staff_id = get_user_staff_id(( SELECT auth.uid() ))) OR has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role)));

DROP POLICY IF EXISTS "Only owners can access salary history" ON public.salary_history;
CREATE POLICY "Only owners can access salary history" ON public.salary_history
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Owners manage loan deductions" ON public.salary_settlement_loan_deductions;
CREATE POLICY "Owners manage loan deductions" ON public.salary_settlement_loan_deductions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Settlement runners record loan deductions" ON public.salary_settlement_loan_deductions;
CREATE POLICY "Settlement runners record loan deductions" ON public.salary_settlement_loan_deductions
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'settlements.run'::text));

DROP POLICY IF EXISTS "Staff view own loan deductions" ON public.salary_settlement_loan_deductions;
CREATE POLICY "Staff view own loan deductions" ON public.salary_settlement_loan_deductions
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM salary_settlements ss
  WHERE ((ss.id = salary_settlement_loan_deductions.settlement_id) AND (ss.staff_id = get_user_staff_id(( SELECT auth.uid() )))))));

DROP POLICY IF EXISTS "Only owners can manage settlements" ON public.salary_settlements;
CREATE POLICY "Only owners can manage settlements" ON public.salary_settlements
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Payslip downloaders can view settlements" ON public.salary_settlements;
CREATE POLICY "Payslip downloaders can view settlements" ON public.salary_settlements
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'payslips.download'::text));

DROP POLICY IF EXISTS "Staff can view own settlements" ON public.salary_settlements;
CREATE POLICY "Staff can view own settlements" ON public.salary_settlements
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Lock salary sheet" ON public.salary_sheet_locks;
CREATE POLICY "Lock salary sheet" ON public.salary_sheet_locks
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((has_permission(( SELECT auth.uid() ), 'settlements.lock'::text) AND (locked_by = ( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Unlock salary sheet" ON public.salary_sheet_locks;
CREATE POLICY "Unlock salary sheet" ON public.salary_sheet_locks
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'settlements.lock'::text));

DROP POLICY IF EXISTS "Create own saved reports" ON public.saved_reports;
CREATE POLICY "Create own saved reports" ON public.saved_reports
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((created_by = ( SELECT auth.uid() )));

DROP POLICY IF EXISTS "Delete own saved reports" ON public.saved_reports;
CREATE POLICY "Delete own saved reports" ON public.saved_reports
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (((created_by = ( SELECT auth.uid() )) OR has_role(( SELECT auth.uid() ), 'owner'::app_role)));

DROP POLICY IF EXISTS "Owners/admins manage saved_reports" ON public.saved_reports;
CREATE POLICY "Owners/admins manage saved_reports" ON public.saved_reports
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Read own saved reports" ON public.saved_reports;
CREATE POLICY "Read own saved reports" ON public.saved_reports
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((created_by = ( SELECT auth.uid() )) OR has_role(( SELECT auth.uid() ), 'owner'::app_role)));

DROP POLICY IF EXISTS "Update own saved reports" ON public.saved_reports;
CREATE POLICY "Update own saved reports" ON public.saved_reports
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (((created_by = ( SELECT auth.uid() )) OR has_role(( SELECT auth.uid() ), 'owner'::app_role)))
  WITH CHECK (((created_by = ( SELECT auth.uid() )) OR has_role(( SELECT auth.uid() ), 'owner'::app_role)));

DROP POLICY IF EXISTS "HR can manage shift_assignment" ON public.shift_assignment;
CREATE POLICY "HR can manage shift_assignment" ON public.shift_assignment
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners and admins manage shift assignment" ON public.shift_assignment;
CREATE POLICY "Owners and admins manage shift assignment" ON public.shift_assignment
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Reviewers and own staff read shift assignment" ON public.shift_assignment;
CREATE POLICY "Reviewers and own staff read shift assignment" ON public.shift_assignment
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR (staff_id = get_user_staff_id(( SELECT auth.uid() )))));

DROP POLICY IF EXISTS "Owners and admins manage shift day timings" ON public.shift_day_timing;
CREATE POLICY "Owners and admins manage shift day timings" ON public.shift_day_timing
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Admins manage shifts" ON public.shifts;
CREATE POLICY "Admins manage shifts" ON public.shifts
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Finance roles view shifts" ON public.shifts;
CREATE POLICY "Finance roles view shifts" ON public.shifts
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "HR can manage shifts" ON public.shifts;
CREATE POLICY "HR can manage shifts" ON public.shifts
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners manage shifts" ON public.shifts;
CREATE POLICY "Owners manage shifts" ON public.shifts
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff view own shift via assignment" ON public.shifts;
CREATE POLICY "Staff view own shift via assignment" ON public.shifts
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM staff_shift_assignments a
  WHERE ((a.shift_id = shifts.id) AND (a.staff_id = get_user_staff_id(( SELECT auth.uid() )))))));

DROP POLICY IF EXISTS "Accountants can create staff without salary" ON public.staff;
CREATE POLICY "Accountants can create staff without salary" ON public.staff
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'accountant'::app_role) AND (monthly_salary = (0)::numeric)));

DROP POLICY IF EXISTS "Admins can create staff without salary" ON public.staff;
CREATE POLICY "Admins can create staff without salary" ON public.staff
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'admin'::app_role) AND (monthly_salary = (0)::numeric)));

DROP POLICY IF EXISTS "Admins can update staff attendance_tracked" ON public.staff;
CREATE POLICY "Admins can update staff attendance_tracked" ON public.staff
  AS PERMISSIVE FOR UPDATE
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Finance users can view staff public" ON public.staff;
CREATE POLICY "Finance users can view staff public" ON public.staff
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role) OR (user_id = ( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "HR can insert staff" ON public.staff;
CREATE POLICY "HR can insert staff" ON public.staff
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "HR can update staff" ON public.staff;
CREATE POLICY "HR can update staff" ON public.staff
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "HR can view all staff" ON public.staff;
CREATE POLICY "HR can view all staff" ON public.staff
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Managers view outlet staff" ON public.staff;
CREATE POLICY "Managers view outlet staff" ON public.staff
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (outlet_id IS NOT NULL) AND (outlet_id = current_user_outlet_id())));

DROP POLICY IF EXISTS "Owners can manage all staff" ON public.staff;
CREATE POLICY "Owners can manage all staff" ON public.staff
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff can view own record" ON public.staff;
CREATE POLICY "Staff can view own record" ON public.staff
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((user_id = ( SELECT auth.uid() )));

DROP POLICY IF EXISTS "Accountants add staff documents" ON public.staff_documents;
CREATE POLICY "Accountants add staff documents" ON public.staff_documents
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Accountants view staff documents" ON public.staff_documents;
CREATE POLICY "Accountants view staff documents" ON public.staff_documents
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'accountant'::app_role));

DROP POLICY IF EXISTS "Admins manage staff documents" ON public.staff_documents;
CREATE POLICY "Admins manage staff documents" ON public.staff_documents
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "CA view staff documents" ON public.staff_documents;
CREATE POLICY "CA view staff documents" ON public.staff_documents
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'ca'::app_role));

DROP POLICY IF EXISTS "HR can manage staff_documents" ON public.staff_documents;
CREATE POLICY "HR can manage staff_documents" ON public.staff_documents
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners manage staff documents" ON public.staff_documents;
CREATE POLICY "Owners manage staff documents" ON public.staff_documents
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff view own documents" ON public.staff_documents;
CREATE POLICY "Staff view own documents" ON public.staff_documents
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Finance can manage staff loans" ON public.staff_loans;
CREATE POLICY "Finance can manage staff loans" ON public.staff_loans
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'payouts.execute'::text))
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'payouts.execute'::text));

DROP POLICY IF EXISTS "Owners manage staff loans" ON public.staff_loans;
CREATE POLICY "Owners manage staff loans" ON public.staff_loans
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff view own loans" ON public.staff_loans;
CREATE POLICY "Staff view own loans" ON public.staff_loans
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Finance roles view roster" ON public.staff_roster;
CREATE POLICY "Finance roles view roster" ON public.staff_roster
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "HR can manage staff_roster" ON public.staff_roster;
CREATE POLICY "HR can manage staff_roster" ON public.staff_roster
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Manage staff_roster" ON public.staff_roster;
CREATE POLICY "Manage staff_roster" ON public.staff_roster
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Managers manage outlet roster" ON public.staff_roster;
CREATE POLICY "Managers manage outlet roster" ON public.staff_roster
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'manager'::app_role) AND (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = staff_roster.staff_id) AND (s.outlet_id IS NOT NULL) AND (s.outlet_id = current_user_outlet_id()))))))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'manager'::app_role));

DROP POLICY IF EXISTS "Owners and admins manage roster" ON public.staff_roster;
CREATE POLICY "Owners and admins manage roster" ON public.staff_roster
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Staff view own roster" ON public.staff_roster;
CREATE POLICY "Staff view own roster" ON public.staff_roster
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Admins manage assignments" ON public.staff_shift_assignments;
CREATE POLICY "Admins manage assignments" ON public.staff_shift_assignments
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'admin'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'admin'::app_role));

DROP POLICY IF EXISTS "Finance roles view assignments" ON public.staff_shift_assignments;
CREATE POLICY "Finance roles view assignments" ON public.staff_shift_assignments
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "HR can manage staff_shift_assignments" ON public.staff_shift_assignments;
CREATE POLICY "HR can manage staff_shift_assignments" ON public.staff_shift_assignments
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners manage assignments" ON public.staff_shift_assignments;
CREATE POLICY "Owners manage assignments" ON public.staff_shift_assignments
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Staff view own assignment" ON public.staff_shift_assignments;
CREATE POLICY "Staff view own assignment" ON public.staff_shift_assignments
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((staff_id = get_user_staff_id(( SELECT auth.uid() ))));

DROP POLICY IF EXISTS "Manage user permissions" ON public.user_permissions;
CREATE POLICY "Manage user permissions" ON public.user_permissions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_permission(( SELECT auth.uid() ), 'users.manage'::text))
  WITH CHECK (has_permission(( SELECT auth.uid() ), 'users.manage'::text));

DROP POLICY IF EXISTS "Manage user_permissions" ON public.user_permissions;
CREATE POLICY "Manage user_permissions" ON public.user_permissions
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Read own user_permissions" ON public.user_permissions;
CREATE POLICY "Read own user_permissions" ON public.user_permissions
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() )) OR has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "View own or managed permissions" ON public.user_permissions;
CREATE POLICY "View own or managed permissions" ON public.user_permissions
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (((user_id = ( SELECT auth.uid() )) OR has_permission(( SELECT auth.uid() ), 'users.manage'::text)));

DROP POLICY IF EXISTS "Owners can manage all roles" ON public.user_roles;
CREATE POLICY "Owners can manage all roles" ON public.user_roles
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Privileged users can view all roles" ON public.user_roles;
CREATE POLICY "Privileged users can view all roles" ON public.user_roles
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role" ON public.user_roles
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() )));

DROP POLICY IF EXISTS "HR can manage week_off" ON public.week_off;
CREATE POLICY "HR can manage week_off" ON public.week_off
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING (has_role(( SELECT auth.uid() ), 'hr'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'hr'::app_role));

DROP POLICY IF EXISTS "Owners and admins manage week off" ON public.week_off;
CREATE POLICY "Owners and admins manage week off" ON public.week_off
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));

DROP POLICY IF EXISTS "Reviewers and own staff read week off" ON public.week_off;
CREATE POLICY "Reviewers and own staff read week off" ON public.week_off
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR (staff_id = get_user_staff_id(( SELECT auth.uid() )))));

DROP POLICY IF EXISTS "Finance roles view whatsapp log" ON public.whatsapp_notification_log;
CREATE POLICY "Finance roles view whatsapp log" ON public.whatsapp_notification_log
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role) OR has_role(( SELECT auth.uid() ), 'accountant'::app_role) OR has_role(( SELECT auth.uid() ), 'ca'::app_role)));

DROP POLICY IF EXISTS "Owners manage whatsapp log" ON public.whatsapp_notification_log;
CREATE POLICY "Owners manage whatsapp log" ON public.whatsapp_notification_log
  AS PERMISSIVE FOR ALL
  TO public
  USING (has_role(( SELECT auth.uid() ), 'owner'::app_role))
  WITH CHECK (has_role(( SELECT auth.uid() ), 'owner'::app_role));

DROP POLICY IF EXISTS "Owners and admins manage working hour history" ON public.working_hour_config_history;
CREATE POLICY "Owners and admins manage working hour history" ON public.working_hour_config_history
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)))
  WITH CHECK ((has_role(( SELECT auth.uid() ), 'owner'::app_role) OR has_role(( SELECT auth.uid() ), 'admin'::app_role)));
