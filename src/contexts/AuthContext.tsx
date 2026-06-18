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
  permissions: Set<string>;
  can: (permission: string) => boolean;
  canManageStaff: boolean;
  canAddStaff: boolean;
  canEditStaff: boolean;
  canViewSalaries: boolean;
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
  // Persist the accountant's context across reloads (was resetting to Personal).
  const [accountingMode, setAccountingModeState] = useState<boolean>(() => {
    try { return localStorage.getItem('accountingMode') === 'true'; } catch { return false; }
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
      // Fetch user role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (roleError && roleError.code !== 'PGRST116') {
        console.error('Error fetching role:', roleError);
      }

      if (roleData) {
        setUserRole(roleData.role as AppRole);
      }

      // Effective permissions — server-resolved (get_my_permissions). Falls back
      // to the role map if the permissions migration isn't deployed yet, so the
      // UI never breaks and no one is locked out.
      const roleStr = (roleData?.role as string | undefined) ?? null;
      try {
        const { data: permRows, error: permErr } = await supabase.rpc('get_my_permissions');
        if (permErr) throw permErr;
        // Trust the server's effective set verbatim — INCLUDING an intentionally
        // empty result (a user restricted to no permissions). Falling back to the
        // role map on empty would silently un-revoke them. The catch below covers
        // the only case that needs the fallback: the RPC not deployed yet (errors).
        setPermissions(new Set((permRows as string[] | null) ?? []));
      } catch {
        setPermissions(fallbackPermsFor(roleStr));
      }

      // Fetch staff data
      const { data: staffDataResult, error: staffError } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', userId)
        .single();

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
    setAccountingMode(false);
  };

  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin';
  const isAccountant = userRole === 'accountant';
  const isStaff = userRole === 'staff';
  const isCA = userRole === 'ca';

  // Permission helpers - STRICT SALARY CONFIDENTIALITY
  
  // Staff management - Owner has full access, Admin/Accountant can add/edit non-salary fields
  const canManageStaff = isOwner;
  const canAddStaff = isOwner || isAdmin || isAccountant;
  const canEditStaff = isOwner || isAdmin || isAccountant; // Non-salary fields only for non-owners
  
  // CRITICAL: Only Owner can view salary data
  // Staff can only view their OWN salary (handled at component level)
  // Admin, Accountant, CA cannot view ANY salary data
  const canViewSalaries = isOwner;
  
  // Payment permissions - differentiated by type
  // Owner: full access
  // Admin: can record payments (advance + expense only, no salary)
  // Accountant: can record payments (advance + expense only, no salary)
  const canMakePayments = isOwner;
  const canRecordPayments = isOwner || isAdmin || isAccountant;
  const canRecordSalaryPayments = isOwner; // Only owner can do salary payments/settlements
  const canRecordAdvancePayments = isOwner || isAdmin || isAccountant;
  const canRecordExpensePayments = isOwner || isAdmin || isAccountant;
  
  // Request approval - Owner and Admin only (Accountant cannot approve)
  const canApproveRequests = isOwner || isAdmin;
  
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
    permissions,
    can,
    canManageStaff,
    canAddStaff,
    canEditStaff,
    canViewSalaries,
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
