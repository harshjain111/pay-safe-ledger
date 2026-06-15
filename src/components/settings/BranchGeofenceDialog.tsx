import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Loader2, ExternalLink } from 'lucide-react';
import { toast } from '@/lib/toast';
import type { GeofenceMode } from '@/lib/geofence';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  outletId: string;
  outletName: string;
  onSaved?: () => void;
}

export function BranchGeofenceDialog({ open, onOpenChange, outletId, outletName, onSaved }: Props) {
  const [mode, setMode] = useState<GeofenceMode>('off');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('100');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !outletId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('outlets')
        .select('latitude, longitude, allowed_radius_meters, geofence_enforcement')
        .eq('id', outletId)
        .maybeSingle();
      if (cancelled) return;
      const o = data as
        | { latitude?: number | null; longitude?: number | null; allowed_radius_meters?: number | null; geofence_enforcement?: string }
        | null;
      setMode((o?.geofence_enforcement as GeofenceMode) ?? 'off');
      setLat(o?.latitude != null ? String(o.latitude) : '');
      setLng(o?.longitude != null ? String(o.longitude) : '');
      setRadius(o?.allowed_radius_meters != null ? String(o.allowed_radius_meters) : '100');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, outletId]);

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation is not supported on this device'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
        toast.success('Current location captured');
      },
      (err) => {
        setLocating(false);
        toast.error(err.message || 'Could not get your location');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const save = async () => {
    const latN = lat.trim() === '' ? null : Number(lat);
    const lngN = lng.trim() === '' ? null : Number(lng);
    const radN = radius.trim() === '' ? null : Math.round(Number(radius));

    if (mode !== 'off') {
      if (latN == null || lngN == null || !radN || radN <= 0) {
        toast.error('Set latitude, longitude and a positive radius to enforce a geofence');
        return;
      }
    }
    if (latN != null && (Number.isNaN(latN) || latN < -90 || latN > 90)) { toast.error('Latitude must be between -90 and 90'); return; }
    if (lngN != null && (Number.isNaN(lngN) || lngN < -180 || lngN > 180)) { toast.error('Longitude must be between -180 and 180'); return; }

    setSaving(true);
    const { error } = await supabase
      .from('outlets')
      .update({ latitude: latN, longitude: lngN, allowed_radius_meters: radN, geofence_enforcement: mode })
      .eq('id', outletId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Geofence saved');
    onSaved?.();
    onOpenChange(false);
  };

  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Geofence · {outletName}</DialogTitle>
          <DialogDescription>Set the branch location and radius. App check-ins outside the radius are blocked or flagged per the mode.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Enforcement</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as GeofenceMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="off">Off — no location check</SelectItem>
                  <SelectItem value="flag">Flag — allow but flag for review</SelectItem>
                  <SelectItem value="block">Block — reject outside the radius</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Latitude</Label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="12.971600" inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Longitude</Label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.594600" inputMode="decimal" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Allowed radius (metres)</Label>
              <Input type="number" min="10" value={radius} onChange={(e) => setRadius(e.target.value)} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={locating} className="gap-1.5">
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                Use my current location
              </Button>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
                  Preview on map <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
