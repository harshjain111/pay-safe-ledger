import { describe, it, expect } from 'vitest';
import { haversineMeters, evaluateGeofence, type BranchGeofence } from './geofence';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(12.9716, 77.5946, 12.9716, 77.5946)).toBe(0);
  });
  it('approximates one degree of latitude (~111 km)', () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
  it('measures a short distance (~500 m north)', () => {
    const d = haversineMeters(12.9716, 77.5946, 12.9716 + 500 / 111_195, 77.5946);
    expect(d).toBeGreaterThan(480);
    expect(d).toBeLessThan(520);
  });
});

const branch: BranchGeofence = {
  latitude: 12.9716,
  longitude: 77.5946,
  allowed_radius_meters: 100,
  geofence_enforcement: 'block',
};
const near = { lat: 12.9716, lng: 77.5946 }; // 0 m
const far = { lat: 12.9716 + 500 / 111_195, lng: 77.5946 }; // ~500 m

describe('evaluateGeofence', () => {
  it('mode off always allows', () => {
    const r = evaluateGeofence(far, { ...branch, geofence_enforcement: 'off' });
    expect(r.action).toBe('ok');
  });

  it('unconfigured branch allows even when enforced', () => {
    const r = evaluateGeofence(far, { ...branch, latitude: null, longitude: null });
    expect(r.action).toBe('ok');
  });

  it('inside the radius is OK', () => {
    const r = evaluateGeofence(near, branch);
    expect(r.status).toBe('inside');
    expect(r.action).toBe('ok');
    expect(r.distanceM).toBe(0);
  });

  it('outside the radius blocks in block mode with a message', () => {
    const r = evaluateGeofence(far, branch);
    expect(r.status).toBe('outside');
    expect(r.action).toBe('block');
    expect(r.distanceM).toBeGreaterThan(400);
    expect(r.message).toMatch(/check-in must be within 100 m/);
  });

  it('outside the radius flags (not blocks) in flag mode', () => {
    const r = evaluateGeofence(far, { ...branch, geofence_enforcement: 'flag' });
    expect(r.action).toBe('flag');
    expect(r.status).toBe('outside');
  });

  it('missing device location blocks in block mode, flags in flag mode', () => {
    const noLoc = { lat: null, lng: null };
    expect(evaluateGeofence(noLoc, branch).action).toBe('block');
    expect(evaluateGeofence(noLoc, { ...branch, geofence_enforcement: 'flag' }).action).toBe('flag');
  });
});
