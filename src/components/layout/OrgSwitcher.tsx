import { Check, ChevronsUpDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganization } from '@/contexts/OrganizationContext';
import { orgDisplayName } from '@/lib/organization';
import { ORGANIZATION } from '@/lib/brand';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// The organisation card at the top of the sidebar.
//
// With one organisation it is exactly what was there before: a label, not a
// control. A dropdown holding a single option is a dead end that still has to
// be read past every time. It only becomes a switcher once there is somewhere
// to switch to.
// ---------------------------------------------------------------------------

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase()
  || ORGANIZATION.shortCode;

function Card({ name, logo, trailing }: { name: string; logo?: string | null; trailing?: React.ReactNode }) {
  return (
    <>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/90">
        {logo
          ? <img src={logo} alt="" className="h-full w-full object-contain" />
          : <span className="text-[9px] font-bold text-sidebar-background">{initials(name)}</span>}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[9px] uppercase tracking-wider text-sidebar-muted">Organization</p>
        <p className="truncate text-[11px] font-semibold text-sidebar-foreground">{name}</p>
      </div>
      {trailing}
    </>
  );
}

export function OrgSwitcher() {
  const { organizations, activeOrg, setActiveOrg, canSwitch, isLoading } = useOrganization();

  const name = orgDisplayName(activeOrg) || ORGANIZATION.name;
  const logo = activeOrg?.logo_url || ORGANIZATION.logo;

  if (isLoading && !activeOrg) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-2.5 py-1.5">
        <div className="h-6 w-6 shrink-0 animate-pulse rounded-md bg-white/20" />
        <div className="h-3 w-24 animate-pulse rounded bg-white/20" />
      </div>
    );
  }

  if (!name) return null;

  if (!canSwitch) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-2.5 py-1.5">
        <Card name={name} logo={logo} />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Organisation: ${name}. Switch organisation`}
          className={cn(
            'mt-3 flex w-full items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-2.5 py-1.5 text-left transition-colors',
            'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Card
            name={name}
            logo={logo}
            trailing={<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs">Switch organisation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => setActiveOrg(org.id)}
            className="cursor-pointer gap-2"
          >
            <span className="min-w-0 flex-1 truncate">{orgDisplayName(org) || 'Untitled'}</span>
            {org.id === activeOrg?.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Switching reloads everything for the organisation you pick.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
