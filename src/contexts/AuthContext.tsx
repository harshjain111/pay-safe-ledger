import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/anyClient';
import { AppRole, UserRole, Staff } from '@/types/database';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '@/lib/permissions';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: AppRole | null;
  staffData: Staff | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  isAccountant: boolean;
  isStaff: boolean;
  isCA: boolean;
  isHR: boolean;
  /** Outlet-scoped Manager ROLE (distinct from the staff.is_manager flag). */
  isOutletManager: boolean;
  /** The current user's own outlet (from their staff link); null when none. */
  outletId: string | null;
  /** True when every query this user makes is outlet-restricted by RLS. */
  isOutletScoped: boolean;
  permissions: Set<string>;
  can: (permission: string) => boolean;
  canManageStaff: boolean;
  canAddStaff: boolean;
  canEditStaff: boolean;
  canViewSalaries: boolean;
  canEditSalaries: boolean;
  isManager: boolean;
  canMakePayments: boolean;
  canApproveExpenses: boolean;
  canApproveRequests: boolean;
  canRecordPayments: boolean;
  canRecordSalaryPayments: boolean;
  canRecordAdvancePayments: boolean;
  canRecordExpensePayments: boolean;
  canAccessSettlements: boolean;
  accountingMode: boolean;
  setAccountingMode: (mode: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Client-side fallback if get_my_permissions() isn't deployed yet — mirrors the
 *  built-in role→permission mapping so the UI never breaks (no lockout). */
function fallbackPermsFor(role: string | null): Set<string> {
  if (role === 'owner') return new Set(ALL_PERMISSIONS);
  return new Set(role ? ROLE_PERMISSIONS[role] ?? [] : []);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [staffData, setStaffData] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Persist the work/employee context across reloads. Default = WORK view (only
  // an explicit switch to the Employee view is stored as 'false'), so admins /
  // accountants land on their management dashboard, not the employee one.
  const [accountingMode, setAccountingModeState] = useState<boolean>(() => {
    try { return localStorage.getItem('accountingMode') !== 'false'; } catch { return true; }
  });
  const setAccountingMode = (mode: boolean) => {
    setAccountingModeState(mode);
    try { localStorage.setItem('accountingMode', String(mode)); } catch { /* storage unavailable */ }
  };
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    let initSettled = false;
    let lastFetchedUserId: string | null = null;

    // Soft failsafe: if init takes too long, flip the loading flag off so
    // the UI isn't stuck on a spinner — but DO NOT wipe auth tokens.
    const initTimeout = window.setTimeout(() => {
      if (initSettled) return;
      console.warn('Auth initialization slow — releasing loading state without clearing session');
      setIsLoading(false);
    }, 15000);

    const settle = () => {
      initSettled = true;
      window.clearTimeout(initTimeout);
    };

    const handleSession = (session: Session | null) => {
      settle();
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Dedupe: both getSession() and the INITIAL_SESSION auth event
        // fire for the same user on load — only fetch once.
        if (lastFetchedUserId === session.user.id) return;
        lastFetchedUserId = session.user.id;
        fetchUserData(session.user.id);
      } else {
        lastFetchedUserId = null;
        setUserRole(null);
        setStaffData(null);
        setPermissions(new Set());
        setIsLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => handleSession(session)
    );

    supabase.auth.getSession()
      .then(({ data: { session } }) => handleSession(session))
      .catch((error) => {
        settle();
        console.error('Error restoring auth session:', error);
        setIsLoading(false);
      });

    return () => {
      window.clearTimeout(initTimeout);
      subscription.unsubscribe();
    };
  }, []);


  const fetchUserData = async (userId: string) => {
    try {
      // All three are independent — roles by user_id, permissions resolved
      // server-side from auth.uid(), staff by user_id — so they go out together.
      //
      // In series they were three sequential round trips (~150 ms each) that
      // every screen in the app waits on: nothing else may fetch until
      // isLoading flips, so this chain sat in front of every page load.
      const [rolesRes, permsRes, staffRes] = await Promise.all([
        // A user may hold more than one role (e.g. accountant + admin); pick a
        // deterministic primary by priority. .single() here used to break the
        // WHOLE session for any multi-role user (errors on >1 row → no role →
        // locked out).
        supabase.from('user_roles').select('role').eq('user_id', userId),
        // Kept rejection-safe: this used to sit in its own try/catch whose
        // fallback is the no-lockout guarantee below. Inside Promise.all a
        // thrown (rather than returned) error would skip that and land in the
        // outer catch, leaving the user with NO permissions at all.
        supabase.rpc('get_my_permissions').then(
          (r) => r,
          (error: unknown) => ({ data: null, error }),
        ),
        supabase.from('staff').select('*').eq('user_id', userId).single(),
      ]);

      const { data: roleRows, error: roleError } = rolesRes;
      if (roleError && roleError.code !== 'PGRST116') {
        console.error('Error fetching role:', roleError);
      }

      const ROLE_PRIORITY = ['owner', 'hr', 'accountant', 'admin', 'manager', 'staff', 'ca'];
      const heldRoles = (roleRows ?? []).map((r) => (r as { role: string }).role);
      const primaryRole = ROLE_PRIORITY.find((r) => heldRoles.includes(r)) ?? heldRoles[0] ?? null;
      if (primaryRole) {
        setUserRole(primaryRole as AppRole);
      }

      // Effective permissions — server-resolved (get_my_permissions). Falls back
      // to the role map if the permissions migration isn't deployed yet, so the
      // UI never breaks and no one is locked out.
      if (permsRes.error) {
        // The only case that needs the fallback: the RPC not deployed yet.
        setPermissions(fallbackPermsFor(primaryRole));
      } else {
        // Trust the server's effective set verbatim — INCLUDING an intentionally
        // empty result (a user restricted to no permissions). Falling back to the
        // role map on empty would silently un-revoke them.
        setPermissions(new Set((permsRes.data as string[] | null) ?? []));
      }

      const { data: staffDataResult, error: staffError } = staffRes;
      if (staffError && staffError.code !== 'PGRST116') {
        console.error('Error fetching staff data:', staffError);
      }

      if (staffDataResult) {
        setStaffData(staffDataResult as Staff);
      }
    } catch (error) {
      console.error('Error in fetchUserData:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      });
      return { error };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Reset context to the default (work) view for the next login.
    setAccountingModeState(true);
    try { localStorage.removeItem('accountingMode'); } catch { /* storage unavailable */ }
  };

  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin';
  const isAccountant = userRole === 'accountant';
  const isStaff = userRole === 'staff';
  const isCA = userRole === 'ca';
  const isHR = userRole === 'hr';
  const isOutletManager = userRole === 'manager';
  const outletId = (staffData as (typeof staffData & { outlet_id?: string | null }) | null)?.outlet_id ?? null;
  const isOutletScoped = isOutletManager;

  // Permission helpers - STRICT SALARY CONFIDENTIALITY
  
  // Staff management - Owner has full access, Admin/Accountant can add/edit non-salary fields
  const canManageStaff = isOwner;
  const canAddStaff = isOwner || isAdmin || isAccountant || isHR;
  const canEditStaff = isOwner || isAdmin || isAccountant || isHR; // Non-salary fields only for non-owners (HR sees salary via salaries.view)
  
  // CRITICAL: Only Owner can view salary data
  // Staff can only view their OWN salary (handled at component level)
  // Admin, Accountant, CA cannot view ANY salary data
  // Salary access is permission-based (owners always pass). Admins/others gain it
  // when their rights template grants salaries.view / salaries.edit.
  const canViewSalaries = isOwner || permissions.has('salaries.view');
  const canEditSalaries = isOwner || permissions.has('salaries.edit');
  // A manager is any staff flagged is_manager — they can approve their reports' leave.
  const isManager = !!(staffData as (typeof staffData & { is_manager?: boolean }) | null)?.is_manager;
  
  // Payment permissions - differentiated by type
  // Owner: full access
  // Admin: can record payments (advance + expense only, no salary)
  // Accountant: can record payments (advance + expense only, no salary)
  const canMakePayments = isOwner;
  const canRecordPayments = isOwner || isAdmin || isAccountant;
  const canRecordSalaryPayments = isOwner; // Only owner can do salary payments/settlements
  const canRecordAdvancePayments = isOwner || isAdmin || isAccountant;
  const canRecordExpensePayments = isOwner || isAdmin || isAccountant;
  
  // Advance approval follows the approvals.approve RIGHT, not the role. It was
  // isOwner || isAdmin, which meant granting approvals.approve to HR let them
  // open the Advance Requests page while every row stayed read-only. Owner
  // short-circuits as everywhere else; Accountant still cannot approve because
  // its template does not carry the right.
  const canApproveRequests = isOwner || permissions.has('approvals.approve');
  
  // Expense approval - Owner and Admin only (Accountant cannot approve)
  const canApproveExpenses = isOwner || isAdmin;
  
  // Settlement access - Owner ONLY
  const canAccessSettlements = isOwner;

  // Permission check — owners always pass (matches the server-side has_permission).
  const can = (permission: string) => isOwner || permissions.has(permission);

  const value = {
    user,
    session,
    userRole,
    staffData,
    isLoading,
    signIn,
    signUp,
    signOut,
    isOwner,
    isAdmin,
    isAccountant,
    isStaff,
    isCA,
    isHR,
    isOutletManager,
    outletId,
    isOutletScoped,
    permissions,
    can,
    canManageStaff,
    canAddStaff,
    canEditStaff,
    canViewSalaries,
    canEditSalaries,
    isManager,
    canMakePayments,
    canApproveExpenses,
    canApproveRequests,
    canRecordPayments,
    canRecordSalaryPayments,
    canRecordAdvancePayments,
    canRecordExpensePayments,
    canAccessSettlements,
    accountingMode,
    setAccountingMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
