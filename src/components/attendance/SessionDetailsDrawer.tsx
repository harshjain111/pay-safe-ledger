import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AttendanceBreak,
  AttendanceSession,
  formatMinutes,
  formatSessionTime,
  getSessionBreaks,
  getSignedPhotoUrl,
  googleMapsLink,
} from '@/lib/attendance';
import { format } from 'date-fns';
import { MapPin, ExternalLink, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AttendanceSession | null;
}

export function SessionDetailsDrawer({ open, onOpenChange, session }: Props) {
  const [inUrl, setInUrl] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [breaks, setBreaks] = useState<AttendanceBreak[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !session) return;
      setLoading(true);
      try {
        const [inU, outU, brs] = await Promise.all([
          getSignedPhotoUrl(session.check_in_photo_url),
          getSignedPhotoUrl(session.check_out_photo_url),
          getSessionBreaks(session.id),
        ]);
        if (cancelled) return;
        setInUrl(inU);
        setOutUrl(outU);
        setBreaks(brs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  if (!session) return null;

  const inMap = googleMapsLink(session.check_in_lat, session.check_in_lng);
  const outMap = googleMapsLink(session.check_out_lat, session.check_out_lng);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            Session — {format(new Date(session.work_date), 'EEE, dd MMM yyyy')}
          </SheetTitle>
          <SheetDescription>
            <Badge variant={session.status === 'completed' ? 'secondary' : 'default'}>
              {session.status}
            </Badge>
            {session.late_checkout && (
              <Badge variant="destructive" className="ml-2">
                Late check-out
              </Badge>
            )}
            {session.auto_closed && (
              <Badge variant="outline" className="ml-2">
                Auto-closed
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-6 mt-6">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Check-in</p>
                <p className="font-medium">
                  {formatSessionTime(session.check_in_at, session.work_date)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Check-out</p>
                <p className="font-medium">
                  {session.check_out_at
                    ? formatSessionTime(session.check_out_at, session.work_date)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Worked</p>
                <p className="font-medium">{formatMinutes(session.worked_minutes)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Breaks</p>
                <p className="font-medium">{formatMinutes(session.total_break_minutes)}</p>
              </div>
            </div>

            {/* Photos + maps */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Check-in</p>
                {inUrl ? (
                  <a href={inUrl} target="_blank" rel="noreferrer">
                    <img
                      src={inUrl}
                      alt="Check-in"
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  </a>
                ) : (
                  <div className="aspect-square w-full rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
                {inMap && (
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a href={inMap} target="_blank" rel="noreferrer">
                      <MapPin className="mr-1 h-3 w-3" />
                      View location
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Check-out</p>
                {outUrl ? (
                  <a href={outUrl} target="_blank" rel="noreferrer">
                    <img
                      src={outUrl}
                      alt="Check-out"
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  </a>
                ) : (
                  <div className="aspect-square w-full rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    No photo
                  </div>
                )}
                {outMap && (
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <a href={outMap} target="_blank" rel="noreferrer">
                      <MapPin className="mr-1 h-3 w-3" />
                      View location
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Breaks */}
            <div>
              <p className="text-sm font-semibold mb-2">Breaks ({breaks.length})</p>
              {breaks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No breaks taken.</p>
              ) : (
                <div className="space-y-2">
                  {breaks.map((b, i) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">Break {i + 1}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(b.start_at), 'hh:mm a')} –{' '}
                          {b.end_at ? format(new Date(b.end_at), 'hh:mm a') : 'ongoing'}
                        </p>
                      </div>
                      <Badge variant="secondary">{formatMinutes(b.duration_minutes)}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
