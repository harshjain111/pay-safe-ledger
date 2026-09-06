import { Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "next-themes";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { lazyRoute, clearChunkReloadGuard } from "@/lib/lazy-route";

// Pages (lazy-loaded so each route is a separate chunk)
const Index = lazyRoute(() => import("./pages/Index"));
const Auth = lazyRoute(() => import("./pages/Auth"));
const Onboarding = lazyRoute(() => import("./pages/Onboarding"));
const Dashboard = lazyRoute(() => import("./pages/Dashboard"));
const StaffList = lazyRoute(() => import("./pages/StaffList"));
const StaffForm = lazyRoute(() => import("./pages/StaffForm"));
const StaffDetails = lazyRoute(() => import("./pages/StaffDetails"));
const UsersList = lazyRoute(() => import("./pages/UsersList"));
const UserForm = lazyRoute(() => import("./pages/UserForm"));
const Ledger = lazyRoute(() => import("./pages/Ledger"));
const Requests = lazyRoute(() => import("./pages/Requests"));
const Grievance = lazyRoute(() => import("./pages/Grievance"));
const Grievances = lazyRoute(() => import("./pages/Grievances"));
const Approvals = lazyRoute(() => import("./pages/Approvals"));
const LoginResets = lazyRoute(() => import("./pages/LoginResets"));
const NewRequest = lazyRoute(() => import("./pages/NewRequest"));
const Settlements = lazyRoute(() => import("./pages/Settlements"));
const ProcessPayroll = lazyRoute(() => import("./pages/ProcessPayroll"));
const FinalizedPayroll = lazyRoute(() => import("./pages/FinalizedPayroll"));
const AdvancesPage = lazyRoute(() => import("./pages/AdvancesPage"));
const TransactionLog = lazyRoute(() => import("./pages/TransactionLog"));
const SalaryIncrements = lazyRoute(() => import("./pages/SalaryIncrements"));
const MySalarySlips = lazyRoute(() => import("./pages/MySalarySlips"));
const SalarySlips = lazyRoute(() => import("./pages/SalarySlips"));
const Payouts = lazyRoute(() => import("./pages/Payouts"));
const Reports = lazyRoute(() => import("./pages/Reports"));
const AuditLog = lazyRoute(() => import("./pages/AuditLog"));
const Settings = lazyRoute(() => import("./pages/Settings"));
const LeaveRecords = lazyRoute(() => import("./pages/LeaveRecords"));
const LeaveApprovals = lazyRoute(() => import("./pages/LeaveApprovals"));
const RightsTemplates = lazyRoute(() => import("./pages/RightsTemplates"));
const BulkAttendance = lazyRoute(() => import("./pages/BulkAttendance"));
const Arrears = lazyRoute(() => import("./pages/Arrears"));
const LeaveTypes = lazyRoute(() => import("./pages/LeaveTypes"));
const LeaveAssign = lazyRoute(() => import("./pages/LeaveAssign"));
const LeaveBalance = lazyRoute(() => import("./pages/LeaveBalance"));
const Attendance = lazyRoute(() => import("./pages/Attendance"));
const MyAttendance = lazyRoute(() => import("./pages/MyAttendance"));
const Shifts = lazyRoute(() => import("./pages/Shifts"));
const WeekOff = lazyRoute(() => import("./pages/WeekOff"));
const BiometricEnrolment = lazyRoute(() => import("./pages/BiometricEnrolment"));
const NotFound = lazyRoute(() => import("./pages/NotFound"));
const PatternsDemo = lazyRoute(() => import("./pages/PatternsDemo"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Protected layout — runs the auth gate ONCE and renders the persistent
// AppLayout (sidebar + header). Child routes render into the layout's <Outlet>,
// so navigating between them never remounts the sidebar.
function ProtectedLayout() {
  const { user, staffData, isLoading } = useAuth();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    // Must stay above AuthContext's own 15s init failsafe, otherwise a slow but
    // valid session restore gets bounced to /auth before auth settles.
    const timeoutId = window.setTimeout(() => {
      setLoadingTimedOut(true);
    }, 20000);

    return () => window.clearTimeout(timeoutId);
  }, [isLoading]);

  if (loadingTimedOut) {
    return <Navigate to="/auth" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // First login: a staff member who hasn't finished onboarding is sent through it
  // before reaching the app. (Users with no staff row — e.g. the owner — skip it.)
  if (staffData && staffData.onboarding_completed === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return <AppLayout />;
}

// Fallback shown while a lazily-loaded route chunk is being fetched
function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

// App routes
function AppRoutes() {
  // A route rendered means the current chunks load, so a tab that reloaded
  // itself past one deploy is free to do the same for the next one.
  useEffect(() => { clearChunkReloadGuard(); }, []);

  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/onboarding" element={<Onboarding />} />

      {/* Protected Routes — one persistent layout; pages swap inside its <Outlet> */}
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/staff" element={<StaffList />} />
        <Route path="/staff/new" element={<StaffForm />} />
        <Route path="/staff/:id" element={<StaffDetails />} />
        <Route path="/staff/:id/edit" element={<StaffForm />} />
        <Route path="/users" element={<UsersList />} />
        <Route path="/users/new" element={<UserForm />} />
        <Route path="/users/:id/edit" element={<UserForm />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/requests/new" element={<NewRequest />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/login-resets" element={<LoginResets />} />
        <Route path="/settlements" element={<Settlements />} />
        <Route path="/my-payslips" element={<MySalarySlips />} />
        <Route path="/leave-records" element={<LeaveRecords />} />
        <Route path="/leave-approvals" element={<LeaveApprovals />} />
        <Route path="/rights-templates" element={<RightsTemplates />} />
        <Route path="/bulk-attendance" element={<BulkAttendance />} />
        <Route path="/leave-types" element={<LeaveTypes />} />
        <Route path="/leave-assign" element={<LeaveAssign />} />
        <Route path="/leave-balance" element={<LeaveBalance />} />

        {/* PHASE 2 — new payroll/settlements paths. Elements are the current
            pages until their rebuild phase replaces them. */}
        <Route path="/payroll/process" element={<ProcessPayroll />} />
        <Route path="/payroll/finalized" element={<FinalizedPayroll />} />
        <Route path="/payroll/increments" element={<SalaryIncrements />} />
        <Route path="/payroll/salary-slips" element={<SalarySlips />} />
        <Route path="/settlements/payouts" element={<Payouts />} />
        <Route path="/settlements/arrears" element={<Arrears />} />
        <Route path="/settlements/advances" element={<AdvancesPage />} />
        <Route path="/settlements/log" element={<TransactionLog />} />

        {/* PHASE 2 — redirects so no bookmark 404s (code deleted in Phase 8).
            /shifts intentionally stays live: the client is keeping Shifts. */}
        <Route path="/payouts" element={<Navigate to="/settlements/payouts" replace />} />
        <Route path="/arrears" element={<Navigate to="/settlements/arrears" replace />} />
        <Route path="/salary-slips" element={<Navigate to="/payroll/salary-slips" replace />} />
        <Route path="/payroll-groups" element={<Navigate to="/payroll/process" replace />} />
        <Route path="/holidays" element={<Navigate to="/leave-records" replace />} />
        <Route path="/holiday-templates" element={<Navigate to="/leave-records" replace />} />
        <Route path="/holiday-assign" element={<Navigate to="/leave-records" replace />} />
        <Route path="/roster" element={<Navigate to="/bulk-attendance" replace />} />
        <Route path="/petty-cash" element={<Navigate to="/ledger" replace />} />
        <Route path="/expenses" element={<Navigate to="/ledger" replace />} />
        <Route path="/expenses/new" element={<Navigate to="/ledger" replace />} />
        {/* PHASE 3 — the tile list is replaced by the Process Payroll grid. */}
        <Route path="/salaries-advances" element={<Navigate to="/payroll/process" replace />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/my-attendance" element={<MyAttendance />} />
        <Route path="/grievance" element={<Grievance />} />
        <Route path="/grievances" element={<Grievances />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/week-off" element={<WeekOff />} />
        <Route path="/biometric-enrolment" element={<BiometricEnrolment />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/:category" element={<Settings />} />
        {/* Phase 1 pattern gallery — dev builds only, not in any nav. */}
        {import.meta.env.DEV && <Route path="/patterns" element={<PatternsDemo />} />}
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
