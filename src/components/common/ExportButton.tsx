import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportRows, type ExportColumn, type ExportFormat } from '@/lib/table-export';

interface ExportButtonProps<T> {
  /** Base file name (extension added automatically). */
  filename: string;
  columns: ExportColumn<T>[];
  rows: T[];
  label?: string;
  sheetName?: string;
  disabled?: boolean;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'secondary' | 'ghost';
  className?: string;
}

/** Reusable Export control — offers Excel (.xlsx) and CSV of the given rows. */
export function ExportButton<T>({
  filename, columns, rows, label = 'Export', sheetName,
  disabled, size = 'sm', variant = 'outline', className,
}: ExportButtonProps<T>) {
  const run = async (format: ExportFormat) => {
    if (!rows.length) {
      toast({ title: 'Nothing to export', description: 'There are no rows for the current view.' });
      return;
    }
    try {
      await exportRows({ filename, columns, rows, format, sheetName });
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={`gap-2 ${className ?? ''}`} disabled={disabled || rows.length === 0}>
          <Download className="h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run('xlsx')}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run('csv')}>
          <FileText className="mr-2 h-4 w-4" /> CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
