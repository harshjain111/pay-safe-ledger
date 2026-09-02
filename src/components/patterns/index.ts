// ============================================================================
// The pattern library (Attendo rebuild, Phase 1).
//
// Every list page from Phase 2 onward MUST compose these primitives instead of
// hand-rolling its own header / filter bar / table chrome / detail view.
// Review them together at /patterns (dev only).
// ============================================================================

export { PageHeader } from './PageHeader';
export { FilterBar, DateRangeField, rangeDayCount, type DateRange } from './FilterBar';
export { ActionsMenu, type ActionsMenuItem, type ActionsMenuExport } from './ActionsMenu';
export { DataTable, type DataTableColumn, type CellTone } from './DataTable';
export { Drawer, type DrawerSize } from './Drawer';
export { ConfigurableHeader, ConfigHistory } from './ConfigurableHeader';
export { RowMenu, type RowMenuItem } from './RowMenu';
export { EmptyState } from './EmptyState';
export { InlineNote } from './InlineNote';
export { ColumnChooser, useColumnPrefs, type ChooserColumn } from './ColumnChooser';
export { ConfirmDestructive } from './ConfirmDestructive';
