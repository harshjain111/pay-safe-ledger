// ============================================================================
// Branch geofencing — pure helpers (no IO, fully unit-testable).
//
// On an app check-in the device location is compared against the staff member's
// branch (outlet) centre + allowed radius. The branch's enforcement mode decides
// whether an out-of-area punch is allowed, flagged for review, or blocked.
// ============================================================================

export type GeofenceMode = 'off' | 'flag' | 'block';

export interface BranchGeofence {
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number | null;
  geofence_enforcement: string | null; // 'off' | 'flag' | 'block'
}

export type GeofenceStatus = 'inside' | 'outside' | 'unknown';
export type GeofenceAction = 'ok' | 'flag' | 'block';

export interface GeofenceResult {
  status: GeofenceStatus;
  /** Distance from the branch centre, rounded to whole metres (null if unknown). */
  distanceM: number | null;
  action: GeofenceAction;
  message?: string;
}

const R = 6_371_000; // Earth radius in metres
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance between two lat/lng points, in metres (haversine). */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function mode(branch: BranchGeofence): GeofenceMode {
  return branch.geofence_enforcement === 'block' ? 'block' : branch.geofence_enforcement === 'flag' ? 'flag' : 'off';
}

/**
 * Evaluate a device location against a branch geofence.
 *
 * - mode 'off', or branch not configured → always OK.
 * - device location missing → cannot verify: block in 'block' mode, flag in
 *   'flag' mode (so a manager can confirm).
 * - inside radius → OK.
 * - outside radius → block in 'block' mode, flag in 'flag' mode, with a clear
 *   message.
 */
export function evaluateGeofence(
  device: { lat: number | null; lng: number | null },
  branch: BranchGeofence,
  branchName?: string,
): GeofenceResult {
  const m = mode(branch);
  if (m === 'off') return { status: 'unknown', distanceM: null, action: 'ok' };

  const radius = branch.allowed_radius_meters;
  if (branch.latitude == null || branch.longitude == null || radius == null || radius <= 0) {
    // Geofence mode is on but the branch has no centre/radius — treat as not set.
    return { status: 'unknown', distanceM: null, action: 'ok' };
  }

  if (device.lat == null || device.lng == null) {
    return {
      status: 'unknown',
      distanceM: null,
      action: m === 'block' ? 'block' : 'flag',
      message: 'Your location could not be determined, so this check-in cannot be verified.',
    };
  }

  const dist = Math.round(haversineMeters(device.lat, device.lng, branch.latitude, branch.longitude));
  if (dist <= radius) return { status: 'inside', distanceM: dist, action: 'ok' };

  return {
    status: 'outside',
    distanceM: dist,
    action: m === 'block' ? 'block' : 'flag',
    message: `You appear to be ${dist} m from ${branchName ?? 'your branch'} — check-in must be within ${radius} m.`,
  };
}
