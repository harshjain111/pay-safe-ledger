import { useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { permissionForPath } from '@/lib/route-permissions';
import { EmptyState } from '@/components/layout/EmptyState';

/**
 * Per-route permission gate (audit P0-H2). Wraps the page <Outlet> so a
 * confidential route is blocked BEFORE its page renders — defense-in-depth on top
 * of each page's own self-gate, and closing the "one un-gated page = a hole" risk
 * of relying solely on page-level checks.
 *
 * Routes with no mapped permission render through untouched. Owners always pass
 * (can() short-circuits on owner), matching the server-side has_permission.
 *
 * Safe against a load-time false-deny: AppLayout only mounts after AuthContext
 * finishes loading (isLoading=false), by which point `permissions` is populated.
 */
export function RequirePermission({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const required = permissionForPath(pathname);

  if (required && !can(required)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access denied"
        description="You don't have permission to view this page. Contact an owner if you need access."
      />
    );
  }

  return <>{children}</>;
}
