import { renderHook, act } from '@testing-library/react';
import { usePagination } from './usePagination';

const list = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('usePagination', () => {
  it('slices to the page size and reports the range', () => {
    const { result } = renderHook(() => usePagination(list(214)));
    expect(result.current.pageRows).toHaveLength(20);
    expect(result.current.pageRows[0]).toBe(1);
    expect(result.current.total).toBe(214);
    expect(result.current.pageCount).toBe(11);
    expect(result.current.firstShown).toBe(1);
    expect(result.current.lastShown).toBe(20);
  });

  it('gives the last page only what is left', () => {
    const { result } = renderHook(() => usePagination(list(214)));
    act(() => result.current.setPage(() => 10));
    expect(result.current.pageRows).toHaveLength(14);
    expect(result.current.firstShown).toBe(201);
    expect(result.current.lastShown).toBe(214);
  });

  it('clamps a page index past the end instead of showing nothing', () => {
    const { result } = renderHook(() => usePagination(list(25)));
    act(() => result.current.setPage(() => 99));
    expect(result.current.page).toBe(1);
    expect(result.current.pageRows).toHaveLength(5);
  });

  it('returns to the first page when a filter shrinks the list', () => {
    // The bug this guards: you page to 7 of 11, type in the search box, the
    // list drops to 3 rows, and you are left staring at an empty page.
    const { result, rerender } = renderHook(({ rows }) => usePagination(rows), {
      initialProps: { rows: list(214) },
    });
    act(() => result.current.setPage(() => 6));
    expect(result.current.page).toBe(6);

    rerender({ rows: list(3) });
    expect(result.current.page).toBe(0);
    expect(result.current.pageRows).toEqual([1, 2, 3]);
  });

  it('changing the page size returns to the first page', () => {
    const { result } = renderHook(() => usePagination(list(214)));
    act(() => result.current.setPage(() => 5));
    act(() => result.current.setPageSize(100));
    expect(result.current.page).toBe(0);
    expect(result.current.pageRows).toHaveLength(100);
    expect(result.current.pageCount).toBe(3);
  });

  it('handles an empty list without claiming to show row 1', () => {
    const { result } = renderHook(() => usePagination<number>([]));
    expect(result.current.pageRows).toEqual([]);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.firstShown).toBe(0);
    expect(result.current.lastShown).toBe(0);
  });
});
