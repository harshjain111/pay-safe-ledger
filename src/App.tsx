import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "next-themes";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

// Pages (lazy-loaded so each route is a separate chunk)
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const StaffList = lazy(() => import("./pages/StaffList"));
const StaffForm = lazy(() => import("./pages/StaffForm"));
const StaffDetails = lazy(() => import("./pages/StaffDetails"));
const UsersList = lazy(() => import("./pages/UsersList"));
const UserForm = lazy(() => import("./pages/UserForm"));
const Ledger = lazy(() => import("./pages/Ledger"));
const Requests = lazy(() => import("./pages/Requests"));
const Approvals = lazy(() => import("./pages/Approvals"));
const NewRequest = lazy(() => import("./pages/NewRequest"));
const Expenses = lazy(() => import("./pages/Expenses"));
const NewExpense = lazy(() => import("./pages/NewExpense"));
const Settlements = lazy(() => import("./pages/Settlements"));
const SalariesAdvances = lazy(() => import("./pages/SalariesAdvances"));
const Roster = lazy(() => import("./pages/Roster"));
const Payouts = lazy(() => import("./pages/Payouts"));
const Reports = lazy(() => import("./pages/Reports"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Settings = lazy(() => import("./pages/Settings"));
const LeaveRecords = lazy(() => import("./pages/LeaveRecords"));
const Holidays = lazy(() => import("./pages/Holidays"));
const RightsTemplates = lazy(() => import("./pages/RightsTemplates"));
const BulkAttendance = lazy(() => import("./pages/BulkAttendance"));
const PayrollGroups = lazy(() => import("./pages/PayrollGroups"));
const Arrears = lazy(() => import("./pages/Arrears"));
const LeaveTypes = lazy(() => import("./pages/LeaveTypes"));
const PettyCash = lazy(() => import("./pages/PettyCash"));
const Attendance = lazy(() => import("./pages/Attendance"));
const MyAttendance = lazy(() => import("./pages/MyAttendance"));
const Shifts = lazy(() => import("./pages/Shifts"));
const BiometricEnrolment = lazy(() => import("./pages/BiometricEnrolment"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
  const { user, isLoading } = useAuth();
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
  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />

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
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/expenses/new" element={<NewExpense />} />
        <Route path="/payouts" element={<Payouts />} />
        <Route path="/settlements" element={<Settlements />} />
        <Route path="/leave-records" element={<LeaveRecords />} />
        <Route path="/holidays" element={<Holidays />} />
        <Route path="/rights-templates" element={<RightsTemplates />} />
        <Route path="/bulk-attendance" element={<BulkAttendance />} />
        <Route path="/payroll-groups" element={<PayrollGroups />} />
        <Route path="/arrears" element={<Arrears />} />
        <Route path="/leave-types" element={<LeaveTypes />} />
        <Route path="/salaries-advances" element={<SalariesAdvances />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="/petty-cash" element={<PettyCash />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/my-attendance" element={<MyAttendance />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/biometric-enrolment" element={<BiometricEnrolment />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/:category" element={<Settings />} />
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
          <InstallPrompt />
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
