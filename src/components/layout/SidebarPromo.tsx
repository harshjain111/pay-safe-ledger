import { Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';

// ---------------------------------------------------------------------------
// The foot of the sidebar.
//
// Just the help link. A promo box for the mobile app lived here and was cut —
// the sidebar is for getting somewhere, and an advert in it is one more thing
// to read past every time you look for a page.
// ---------------------------------------------------------------------------

export function SidebarPromo() {
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
