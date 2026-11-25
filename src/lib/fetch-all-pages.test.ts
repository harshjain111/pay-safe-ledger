import { describe, it, expect } from 'vitest';
import { fetchAllPages } from './fetch-all-pages';

const source = (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (f: number, t: number) => { calls.push([f, t]); return { data: rows.slice(f, t + 1), error: null }; };
  return { rows, calls, page };
};

describe('fetchAllPages', () => {
  it('returns every row past the 1,000-row cap, once each and in order', async () => {
    const s = source(2514);
    expect(await fetchAllPages<number>(s.page)).toEqual(s.rows);
    expect(s.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('keeps going when a page is exactly full', async () => {
    const s = source(1000);
    expect(await fetchAllPages<number>(s.page)).toHaveLength(1000);
    expect(s.calls).toHaveLength(2);
  });

  it('throws instead of returning a partial result', async () => {
    await expect(fetchAllPages(async (f) => (f === 0
      ? { data: Array(1000).fill(0), error: null }
      : { data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });
});
