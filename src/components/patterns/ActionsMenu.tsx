import type { ComponentType, ReactNode } from 'react';
import { ChevronDown, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { exportRows, type ExportColumn } from '@/lib/table-export';
import { exportTableToPDF } from '@/lib/report-export';

export interface ActionsMenuItem {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ActionsMenuExport<T> {
  /** Base file name — extension appended per format. */
  filename: string;
  /** PDF document title (defaults to filename). */
  title?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  sheetName?: string;
}

/**
 * Pattern 3 — the "Actions" dropdown. Holds Export Excel and Export PDF by
 * default (via the ONE shared export utility — never reimplement export per
 * page), plus any page-specific items. Disabled when there is no result set.
 */
export function ActionsMenu<T>({
  exportConfig,
  items = [],
  label = 'Actions',
  disabled,
}: {
  exportConfig?: ActionsMenuExport<T>;
  items?: ActionsMenuItem[];
  label?: string;
  disabled?: boolean;
}) {
  const noRows = !exportConfig || exportConfig.rows.length === 0;
  const isDisabled = disabled ?? (noRows && items.length === 0);

  const runExcel = async () => {
    if (!exportConfig) return;
    try {
      await exportRows({
        filename: exportConfig.filename,
        sheetName: exportConfig.sheetName,
        columns: exportConfig.columns,
        rows: exportConfig.rows,
        format: 'xlsx',
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const runPDF = async () => {
    if (!exportConfig) return;
    try {
      await exportTableToPDF({
        title: exportConfig.title ?? exportConfig.filename,
        filename: exportConfig.filename,
        headers: exportConfig.columns.map((c) => c.header),
        rows: exportConfig.rows.map((r) =>
          exportConfig.columns.map((c) => {
            const v = c.value(r);
            return v == null ? '' : v;
          }),
        ),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5" disabled={isDisabled}>
          {label} <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {exportConfig && (
          <>
            <DropdownMenuItem onClick={runExcel} disabled={noRows}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={runPDF} disabled={noRows}>
              <FileText className="mr-2 h-4 w-4" /> Export PDF
            </DropdownMenuItem>
            {items.length > 0 && <DropdownMenuSeparator />}
          </>
        )}
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onSelect}
              disabled={item.disabled}
              className={item.destructive ? 'text-destructive focus:text-destructive' : undefined}
            >
              {Icon && <Icon className="mr-2 h-4 w-4" />} {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type { ExportColumn };
export type ActionsMenuSlot = ReactNode;
