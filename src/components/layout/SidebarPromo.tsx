import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// The foot of the sidebar.
//
// Just the help link. A promo box for the mobile app lived here and was cut —
// the sidebar is for getting somewhere, and an advert in it is one more thing
// to read past every time you look for a page.
//
// Hidden from owners. A concern is read by owners and nobody else (RLS:
// "Owners read grievances"), so an owner pressing this would be filing a
// report addressed to themselves. Their own inbox is already in the nav as
// Concerns, so there is nothing to put here in its place.
// ---------------------------------------------------------------------------

export function SidebarPromo() {
  const { isOwner } = useAuth();
  if (isOwner) return null;

  return (
    <div className="space-y-2 px-1 pb-1 group-data-[collapsible=icon]:hidden">
      <Link
        to="/grievance"
        className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LifeBuoy className="h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-tight">Need help?</span>
          <span className="block text-[11px] leading-tight opacity-70">Raise a concern</span>
        </span>
      </Link>
    </div>
  );
}
