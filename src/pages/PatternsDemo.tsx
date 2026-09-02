import { useState } from 'react';
import { Inbox, Pencil, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  PageHeader, FilterBar, DateRangeField, ActionsMenu, DataTable, Drawer,
  ConfigurableHeader, ConfigHistory, RowMenu, EmptyState, InlineNote,
  ColumnChooser, useColumnPrefs, ConfirmDestructive,
  type DataTableColumn, type DateRange,
} from '@/components/patterns';
import { toast } from '@/lib/toast';

interface DemoRow {
  id: string;
  name: string;
  code: string;
  present: number;
  absent: number;
  net: number;
}

const DEMO_ROWS: DemoRow[] = Array.from({ length: 35 }, (_, i) => ({
  id: String(i + 1),
  name: `Employee ${i + 1}`,
  code: `K2H${String(100 + i)}`,
  present: 20 + (i % 8),
  absent: i % 4,
  net: 10000 + i * 137,
}));

const DEMO_COLS: { key: string; label: string }[] = [
  { key: 'name', label: 'Employee' },
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'net', label: 'Net Payable' },
  { key: 'menu', label: 'Actions' },
];

/** Dev-only gallery of the Phase 1 pattern library — one example of each. */
export default function PatternsDemo() {
  const [applied, setApplied] = useState<{ range: DateRange; scope: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nestedOpen, setNestedOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { visibleKeys, save, reset } = useColumnPrefs('patterns-demo', DEMO_COLS.map((c) => c.key));

  const columns: DataTableColumn<DemoRow>[] = [
    { key: 'name', header: 'Employee', width: 200, render: (r) => (
      <div><p className="font-medium leading-tight">{r.name}</p><p className="text-[11px] leading-tight text-muted-foreground">{r.code}</p></div>
    ) },
    { key: 'present', header: <ConfigurableHeader label="Present" onOpen={() => setRulesOpen(true)} />, align: 'center', cellTone: () => 'positive', render: (r) => r.present },
    { key: 'absent', header: 'Absent', align: 'center', cellTone: (r) => (r.absent > 0 ? 'negative' : undefined), render: (r) => r.absent },
    { key: 'net', header: 'Net Payable', align: 'right', bold: true, render: (r) => r.net.toLocaleString('en-IN') },
    { key: 'menu', header: '', align: 'center', render: (r) => (
      <RowMenu items={[
        { label: 'Preview', icon: Eye, onSelect: () => setDrawerOpen(true) },
        { label: 'Adjust', icon: Pencil, onSelect: () => toast.message(`Adjust ${r.name}`) },
        { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setConfirmOpen(true) },
      ]} />
    ) },
  ];

  const rows = applied ? DEMO_ROWS : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pattern Library"
        count={rows.length}
        actions={
          <>
            <ColumnChooser pageId="patterns-demo" columns={DEMO_COLS} visibleKeys={visibleKeys} onSave={save} onReset={reset} />
            <Button variant="outline" onClick={() => setDrawerOpen(true)}>Open Drawer</Button>
            <Button disabled={selected.size === 0} onClick={() => toast.success(`Finalized ${selected.size}`)}>
              Finalize {selected.size} Selected
            </Button>
          </>
        }
      />

      <FilterBar<{ range: DateRange; scope: string }>
        initial={{ range: { from: '2026-08-01', to: '2026-08-31' }, scope: 'all' }}
        onSearch={setApplied}
        trailing={
          <ActionsMenu
            exportConfig={{
              filename: 'patterns-demo',
              title: 'Pattern Demo',
              rows,
              columns: [
                { header: 'Employee', value: (r: DemoRow) => r.name },
                { header: 'Present', value: (r: DemoRow) => r.present },
                { header: 'Net', value: (r: DemoRow) => r.net },
              ],
            }}
          />
        }
      >
        {(draft, setDraft) => (
          <>
            <Select value={draft.scope} onValueChange={(v) => setDraft({ ...draft, scope: v })}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outlets</SelectItem>
                <SelectItem value="ballu">Ballu</SelectItem>
                <SelectItem value="mirosh">Mirosh</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeField value={draft.range} onChange={(range) => setDraft({ ...draft, range })} />
          </>
        )}
      </FilterBar>

      <InlineNote>Finalized months are locked. De-finalize from Finalized Payroll to make changes.</InlineNote>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        stickyColumns={1}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        visibleColumnKeys={visibleKeys}
        selectionSummary={
          <span className="text-muted-foreground">
            Net total ₹{[...selected].reduce((sum, id) => sum + (DEMO_ROWS.find((r) => r.id === id)?.net ?? 0), 0).toLocaleString('en-IN')}
          </span>
        }
        empty={<EmptyState icon={Inbox} title="Nothing to show yet" instruction="Choose a date range above and press Search." />}
      />

      {/* Drawer + stacked drawer */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Detail Drawer (md)"
        description="Lists stay behind the drawer with scroll and filters intact."
        footer={<Button className="w-full" onClick={() => setNestedOpen(true)}>Open a stacked drawer</Button>}
      >
        <p className="text-sm text-muted-foreground">
          Body content scrolls independently. Press Escape or click the backdrop to close the topmost drawer only.
        </p>
      </Drawer>
      <Drawer open={nestedOpen} onOpenChange={setNestedOpen} title="Stacked Drawer (sm)" size="sm">
        <p className="text-sm text-muted-foreground">Escape unwinds this one first.</p>
      </Drawer>

      {/* Rules drawer w/ ConfigHistory */}
      <Drawer
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        title="Present / Absent rules"
        size="md"
        footer={<Button className="w-full" onClick={() => { toast.success('Saved'); setRulesOpen(false); }}>Save</Button>}
      >
        <p className="text-sm text-muted-foreground">A rules form would sit here (hr_pay_rules fields).</p>
        <ConfigHistory table="hr_pay_rules" />
      </Drawer>

      <ConfirmDestructive
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete record?"
        recordName="Employee 1 — K2H100"
        confirmText="DELETE"
        description="The row and its history will be removed."
        onConfirm={() => { toast.success('Deleted (demo)'); setConfirmOpen(false); }}
      />
    </div>
  );
}
