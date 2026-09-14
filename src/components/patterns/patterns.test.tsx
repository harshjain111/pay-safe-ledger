import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBar, DateRangeField, rangeDayCount, type DateRange } from './FilterBar';
import { DataTable, type DataTableColumn } from './DataTable';
import { PageHeader } from './PageHeader';
import { useState } from 'react';

describe('FilterBar (pattern 2)', () => {
  it('does NOT lift filters while editing — only when Search is pressed', () => {
    const onSearch = vi.fn();
    render(
      <FilterBar<{ q: string }> initial={{ q: '' }} onSearch={onSearch}>
        {(draft, setDraft) => (
          <input
            aria-label="scope"
            value={draft.q}
            onChange={(e) => setDraft({ q: e.target.value })}
          />
        )}
      </FilterBar>,
    );

    fireEvent.change(screen.getByLabelText('scope'), { target: { value: 'ballu' } });
    // Editing the draft must trigger NO query.
    expect(onSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith({ q: 'ballu' });
  });

  it('lifts the LATEST draft on subsequent searches', () => {
    const onSearch = vi.fn();
    render(
      <FilterBar<{ q: string }> initial={{ q: 'a' }} onSearch={onSearch}>
        {(draft, setDraft) => (
          <input aria-label="scope" value={draft.q} onChange={(e) => setDraft({ q: e.target.value })} />
        )}
      </FilterBar>,
    );
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    fireEvent.change(screen.getByLabelText('scope'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(onSearch).toHaveBeenNthCalledWith(1, { q: 'a' });
    expect(onSearch).toHaveBeenNthCalledWith(2, { q: 'b' });
  });
});

describe('DateRangeField (pattern 2b)', () => {
  it('computes the inclusive day count', () => {
    expect(rangeDayCount({ from: '2026-08-01', to: '2026-08-31' })).toBe(31);
    expect(rangeDayCount({ from: '2026-08-01', to: '2026-08-01' })).toBe(1);
    expect(rangeDayCount({ from: '2026-08-02', to: '2026-08-01' })).toBeNull();
    expect(rangeDayCount({ from: '', to: '2026-08-01' })).toBeNull();
  });

  it('renders the day count beside the range', () => {
    const Harness = () => {
      const [range, setRange] = useState<DateRange>({ from: '2026-08-01', to: '2026-08-31' });
      return <DateRangeField value={range} onChange={setRange} />;
    };
    render(<Harness />);
    expect(screen.getByText('31 Days')).toBeInTheDocument();
  });
});

describe('DataTable (pattern 4)', () => {
  interface Row { id: string; name: string; amount: number }
  const rows: Row[] = [
    { id: '1', name: 'A', amount: 10 },
    { id: '2', name: 'B', amount: 20 },
  ];
  const columns: DataTableColumn<Row>[] = [
    { key: 'name', header: 'Name', width: 160, render: (r) => r.name },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => r.amount },
  ];

  it('freezes the first N columns with position:sticky and shadows the edge column', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} stickyColumns={1} />);
    const stickyCells = document.querySelectorAll('[data-sticky="true"]');
    // 1 header + 2 body cells for the single sticky column
    expect(stickyCells.length).toBe(3);
    for (const cell of stickyCells) {
      const style = (cell as HTMLElement).style;
      expect(style.position).toBe('sticky');
      expect(style.left).toBe('0px');
      // last (only) sticky column carries the right-edge shadow
      expect(style.boxShadow).not.toBe('');
    }
    // Non-sticky column stays unfrozen.
    const headers = screen.getAllByRole('columnheader');
    const amountHeader = headers.find((h) => h.textContent === 'Amount') as HTMLElement;
    expect(amountHeader.style.position).not.toBe('sticky');
  });

  it('scrolls horizontally inside its own container', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByTestId('datatable-scroll').className).toContain('overflow-x-auto');
  });

  it('shows the "Showing X–Y of Z" footer and paginates', () => {
    const many: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `R${i}`, amount: i }));
    render(<DataTable columns={columns} rows={many} rowKey={(r) => r.id} defaultPageSize={10} />);
    expect(screen.getByText('Showing 1–10 of 25')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText('Showing 11–20 of 25')).toBeInTheDocument();
  });
});

describe('DataTable selection with locked rows', () => {
  // The bug: Process Payroll filtered paid rows out of the selection set after
  // the fact. The checkbox ticked and immediately un-ticked with no reason
  // given, and because "every row on the page is selected" could then never be
  // true, the header checkbox only ever added — clicking it again did nothing.
  interface R { id: string; name: string; paid: boolean }
  const rows: R[] = [
    { id: 'a', name: 'Ann', paid: false },
    { id: 'b', name: 'Bob', paid: true },
    { id: 'c', name: 'Cal', paid: false },
  ];
  const cols: DataTableColumn<R>[] = [{ key: 'name', header: 'Name', render: (r) => r.name }];
  const reason = (r: R) => (r.paid ? 'Already paid' : null);

  function Harness() {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    return (
      <>
        <span data-testid="count">{selected.size}</span>
        <DataTable<R>
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          rowUnselectableReason={reason}
          selected={selected}
          onSelectedChange={setSelected}
        />
      </>
    );
  }

  it('disables a locked row and says why, instead of refusing silently', () => {
    render(<Harness />);
    const locked = screen.getByLabelText('Cannot select: Already paid');
    expect(locked).toBeDisabled();
    // The explanation has to sit on a wrapper: a disabled control fires no
    // hover of its own.
    expect(locked.closest('[title]')).toHaveAttribute('title', 'Already paid');
  });

  it('select-all takes only the selectable rows, and clicking again clears them', () => {
    render(<Harness />);
    const all = screen.getByLabelText('Select page');

    fireEvent.click(all);
    expect(screen.getByTestId('count')).toHaveTextContent('2');   // Ann + Cal, not Bob

    fireEvent.click(all);
    expect(screen.getByTestId('count')).toHaveTextContent('0');   // and it clears
  });

  it('still selects every row when none are locked', () => {
    function Open() {
      const [selected, setSelected] = useState<Set<string>>(new Set());
      return (
        <>
          <span data-testid="n">{selected.size}</span>
          <DataTable<R> columns={cols} rows={rows} rowKey={(r) => r.id} selectable
            selected={selected} onSelectedChange={setSelected} />
        </>
      );
    }
    render(<Open />);
    fireEvent.click(screen.getByLabelText('Select page'));
    expect(screen.getByTestId('n')).toHaveTextContent('3');
    fireEvent.click(screen.getByLabelText('Select page'));
    expect(screen.getByTestId('n')).toHaveTextContent('0');
  });
});

describe('PageHeader (pattern 1)', () => {
  it('renders the description under the title, and omits it when not given', () => {
    const { rerender } = render(
      <PageHeader title="Finalized Payroll" count={3} description="What this page is for." />,
    );
    expect(screen.getByRole('heading', { name: /Finalized Payroll/ })).toBeInTheDocument();
    expect(screen.getByText('What this page is for.')).toBeInTheDocument();
    // The count stays part of the heading, not the description.
    expect(screen.getByRole('heading', { name: /\(3\)/ })).toBeInTheDocument();

    rerender(<PageHeader title="Finalized Payroll" count={3} />);
    expect(screen.queryByText('What this page is for.')).not.toBeInTheDocument();
  });
});
