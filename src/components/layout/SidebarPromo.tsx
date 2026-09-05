import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LifeBuoy, Smartphone } from 'lucide-react';
import { BRAND } from '@/lib/brand';

// ---------------------------------------------------------------------------
// The foot of the sidebar: take it on your phone, and get help.
//
// Replaces the floating "Install App" bar, which sat over the page bottom and
// covered whatever was under it — on the Finalized Payroll screen it landed on
// top of the row actions. A card in the rail is always available and never in
// the way.
//
// The install button only appears when the browser has actually offered an
// install (beforeinstallprompt). Chrome fires it, Safari does not, and an
// install button that cannot install is worse than none — so on those browsers
// the card still says the app works on a phone, without a dead control.
// ---------------------------------------------------------------------------

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function SidebarPromo() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    // Once installed the offer is meaningless, so drop it.
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstallEvent(null);
  };

  return (
    <div className="space-y-2 px-1 pb-1 group-data-[collapsible=icon]:hidden">
      <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 shrink-0 rounded-lg bg-primary/10 p-1.5 text-primary">
            <Smartphone className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-snug text-sidebar-foreground">
              Take {BRAND.productName} on the go
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-sidebar-foreground/60">
              Manage your team anytime, anywhere.
            </p>
          </div>
        </div>

        {installEvent ? (
          <button
            type="button"
            onClick={install}
            className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
          >
            Explore Mobile App
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <p className="mt-2.5 text-[11px] font-medium text-sidebar-foreground/50">
            Open this address on your phone.
          </p>
        )}
      </div>

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
