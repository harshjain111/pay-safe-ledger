import { describe, it, expect } from 'vitest';
import { isStaleChunkError } from './lazy-route';

describe('isStaleChunkError', () => {
  // The exact message the deployed app produced when asked for a chunk that a
  // later build had replaced. Captured from hr-buddy-nine.vercel.app, not
  // invented — this is the string the recovery has to recognise.
  it('matches the real Chrome message from the live site', () => {
    expect(isStaleChunkError(new TypeError(
      'Failed to fetch dynamically imported module: https://hr-buddy-nine.vercel.app/assets/BiometricEnrolment-OLDHASH123.js',
    ))).toBe(true);
  });

  it('matches the other browsers wording for the same failure', () => {
    for (const m of [
      'error loading dynamically imported module',
      'Importing a module script failed.',
      "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\".",
      'ChunkLoadError: Loading chunk 42 failed.',
    ]) {
      expect(isStaleChunkError(new Error(m)), m).toBe(true);
    }
  });

  it('leaves real application bugs alone so they still surface', () => {
    for (const m of [
      "Cannot read properties of undefined (reading 'map')",
      'Invalid time value',
      'Not authorized',
      'Failed to fetch',           // a plain network error is NOT a stale chunk
    ]) {
      expect(isStaleChunkError(new Error(m)), m).toBe(false);
    }
  });

  it('handles non-Error throws without blowing up', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module: /a.js')).toBe(true);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});
