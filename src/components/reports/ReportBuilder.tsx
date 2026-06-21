import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  Play, Save, FileSpreadsheet, FileText, Trash2, Loader2, Wrench, Lock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/anyClient';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/layout/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { toast } from '@/lib/toast';
import {
  REPORT_SOURCES, getSource, computeReport, formatDisplay, buildExportMatrix, isNumericType,
  type SourceKey, type ReportDefinition, type ReportSort, type ComputedReport, type ReportRow, type SavedReport,
} from '@/lib/report-builder';
import { fetchReportRows, loadReportFilterOptions, type ReportFilterOptions } from '@/lib/report-builder-data';
import { exportSheetsToExcel, exportTableToPDF } from '@/lib/report-export';

const NONE = '__none__';
const ALL = '__all__';

export function ReportBuilder() {
  const { user, can, canViewSalaries } = useAuth();

  // Salary data is owner-only everywhere in the app (canViewSalaries === isOwner),
  // so the report builder must apply the SAME gate to its salary source rather
  // than the looser `salaries.view` permission — otherwise a non-owner granted
  // that permission could build salary reports the rest of the app denies. (P0-H3)
  const canUseSource = useCallback(
    (permission: string) =>
      can(permission) && (permission !== 'salaries.view' || canViewSalaries),
    [can, canViewSalaries],
  );

  // Only sources whose data permission the user holds (C.6 enforcement).
  const allowedSources = useMemo(() => REPORT_SOURCES.filter((s) => canUseSource(s.permission)), [canUseSource]);

  const [source, setSource] = useState<SourceKey | null>(allowedSources[0]?.key ?? null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [staffId, setStaffId] = useState(ALL);
  const [department, setDepartment] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [groupBy, setGroupBy] = useState<string>(NONE);
  const [sortField, setSortField] = useState<string>(NONE);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [preview, setPreview] = useState<ComputedReport | null>(null);
  const [running, setRunning] = useState(false);
  const [options, setOptions] = useState<ReportFilterOptions>({ staff: [], departments: [], branches: [] });
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savedName, setSavedName] = useState('Custom report'); // title used for export

  const sourceDef = source ? getSource(source) : null;
  const selectedColumns = useMemo(
    () => (sourceDef ? sourceDef.fields.filter((f) => enabled.has(f.key)).map((f) => f.key) : []),
    [sourceDef, enabled]
  );

  const loadSaved = useCallback(async () => {
    const { data } = await supabase
      .from('saved_reports')
      .select('id, name, source, definition, created_by, created_at, updated_at')
      .order('updated_at', { ascending: false });
    setSaved((data ?? []).map((r) => ({ ...r, source: r.source as SourceKey, definition: r.definition as unknown as ReportDefinition })) as SavedReport[]);
  }, []);

  useEffect(() => {
    loadReportFilterOptions().then(setOptions);
    loadSaved();
  }, [loadSaved]);

  // When the source changes, enable all its columns and reset group/sort/preview.
  const applySource = useCallback((key: SourceKey) => {
    const def = getSource(key);
    setSource(key);
    setEnabled(new Set(def.fields.map((f) => f.key)));
    setGroupBy(NONE);
    setSortField(NONE);
    setPreview(null);
  }, []);

  useEffect(() => {
    if (source) setEnabled(new Set(getSource(source).fields.map((f) => f.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildDefinition = useCallback((): ReportDefinition | null => {
    if (!source) return null;
    const sort: ReportSort | null = sortField !== NONE ? { field: sortField, dir: sortDir } : null;
    return {
      source,
      columns: selectedColumns,
      filters: {
        from, to,
        staffId: staffId === ALL ? '' : staffId,
        department: department === ALL ? '' : department,
        branch: branch === ALL ? '' : branch,
      },
      groupBy: groupBy === NONE ? null : groupBy,
      sort,
    };
  }, [source, selectedColumns, from, to, staffId, department, branch, groupBy, sortField, sortDir]);

  const run = useCallback(async (def?: ReportDefinition) => {
    const definition = def ?? buildDefinition();
    if (!definition) return;
    const src = getSource(definition.source);
    if (!canUseSource(src.permission)) {
      toast.error(`You don't have permission to view ${src.label.toLowerCase()} data`);
      return;
    }
    if (!definition.columns.length) {
      toast.error('Pick at least one column');
      return;
    }
    setRunning(true);
    try {
      const rows = await fetchReportRows(definition.source, definition.filters);
      setPreview(computeReport(rows, definition));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to run report');
    } finally {
      setRunning(false);
    }
  }, [buildDefinition, canUseSource]);

  const toggleColumn = (key: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (groupBy === key) setGroupBy(NONE);
    if (sortField === key) setSortField(NONE);
  };

  const doSave = async () => {
    const definition = buildDefinition();
    if (!definition) return;
    if (!saveName.trim()) { toast.error('Name your report'); return; }
    const { error } = await supabase.from('saved_reports').insert({
      name: saveName.trim(),
      source: definition.source,
      definition: definition as unknown as Json,
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Report saved');
    setSavedName(saveName.trim());
    setSaveName('');
    setSaveOpen(false);
    loadSaved();
  };

  const loadReport = (r: SavedReport) => {
    const src = REPORT_SOURCES.find((s) => s.key === r.source);
    if (!src || !canUseSource(src.permission)) {
      toast.error('You no longer have access to this report’s data');
      return;
    }
    const d = r.definition;
    setSource(r.source);
    setEnabled(new Set(d.columns));
    setFrom(d.filters.from);
    setTo(d.filters.to);
    setStaffId(d.filters.staffId || ALL);
    setDepartment(d.filters.department || ALL);
    setBranch(d.filters.branch || ALL);
    setGroupBy(d.groupBy || NONE);
    setSortField(d.sort?.field || NONE);
    setSortDir(d.sort?.dir || 'asc');
    setSavedName(r.name);
    run(d);
  };

  const deleteReport = async (r: SavedReport) => {
    const { error } = await supabase.from('saved_reports').delete().eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Report deleted');
    loadSaved();
  };

  const exportExcel = () => {
    if (!preview) return;
    const { headers, rows } = buildExportMatrix(preview);
    exportSheetsToExcel(savedName, [{ name: savedName, headers, rows }]);
  };
  const exportPDF = () => {
    if (!preview) return;
    const { headers, rows } = buildExportMatrix(preview);
    exportTableToPDF({
      title: savedName,
      subtitle: sourceDef ? `${sourceDef.label} report` : undefined,
      filename: savedName,
      headers, rows,
      dateRange: { from: new Date(from), to: new Date(to) },
    });
  };

  const previewRows = useMemo(
    () => (preview ? preview.rows.map((r, i) => ({ ...r, __rk: i })) : []),
    [preview]
  );
  const previewColumns: DataTableColumn<ReportRow>[] = useMemo(() => {
    if (!preview) return [];
    return preview.columns.map((c) => ({
      id: c.key,
      header: c.label,
      align: isNumericType(c.type) ? 'right' : 'left',
      sortable: true,
      sortAccessor: (row: ReportRow) => row[c.key],
      cell: (row: ReportRow) => formatDisplay(row[c.key], c.type),
    }));
  }, [preview]);

  if (allowedSources.length === 0) {
    return (
      <EmptyState
        icon={Lock}
        title="No data sources available"
        description="You don't have permission to build reports over any data source."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Builder configuration */}
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Wrench className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> Report Builder
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Pick a data source and columns, filter, group and preview — then save or export.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
          {/* Source + date range */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data source</Label>
              <Select value={source ?? undefined} onValueChange={(v) => applySource(v as SourceKey)}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {allowedSources.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From{sourceDef?.dateGranularity === 'month' ? ' (month)' : ''}</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {/* Dimension filters */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Staff</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover max-h-72">
                  <SelectItem value={ALL}>All staff</SelectItem>
                  {options.staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={ALL}>All departments</SelectItem>
                  {options.departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Branch</Label>
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={ALL}>All branches</SelectItem>
                  {options.branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Columns */}
          {sourceDef && (
            <div className="space-y-1.5">
              <Label className="text-xs">Columns</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border p-3">
                {sourceDef.fields.map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={enabled.has(f.key)} onCheckedChange={() => toggleColumn(f.key)} />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Group + sort */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Group by</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={NONE}>No grouping</SelectItem>
                  {sourceDef?.fields.filter((f) => enabled.has(f.key)).map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sort by</Label>
              <Select value={sortField} onValueChange={setSortField}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={NONE}>No sort</SelectItem>
                  {sourceDef?.fields.filter((f) => enabled.has(f.key)).map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  {groupBy !== NONE && <SelectItem value="__count">Count</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Direction</Label>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as 'asc' | 'desc')} disabled={sortField === NONE}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => run()} disabled={running} className="gap-1.5">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run / Preview
            </Button>
            <Button variant="outline" onClick={() => setSaveOpen(true)} className="gap-1.5">
              <Save className="h-4 w-4" /> Save
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={!preview} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={exportPDF} disabled={!preview} className="gap-1.5">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved reports */}
      {saved.length > 0 && (
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
            <CardTitle className="text-sm">Saved reports</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="flex flex-wrap gap-2">
              {saved.map((r) => {
                const src = REPORT_SOURCES.find((s) => s.key === r.source);
                const accessible = !!src && can(src.permission);
                return (
                  <div key={r.id} className="inline-flex items-center gap-1 rounded-lg border bg-card pl-2.5 pr-1 py-1">
                    <button
                      type="button"
                      className="text-sm font-medium disabled:opacity-50"
                      disabled={!accessible}
                      onClick={() => loadReport(r)}
                      title={accessible ? 'Load report' : 'No access to this data'}
                    >
                      {r.name}
                    </button>
                    <Badge variant="secondary" className="text-[10px]">{src?.label ?? r.source}</Badge>
                    {!accessible && <Lock className="h-3 w-3 text-muted-foreground" />}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Delete ${r.name}`} onClick={() => deleteReport(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{preview.rows.length} row(s)</p>
          <DataTable
            columns={previewColumns}
            data={previewRows}
            rowKey={(r) => String((r as ReportRow & { __rk: number }).__rk)}
            pageSize={25}
            density="compact"
            emptyState={<EmptyState icon={Wrench} title="No rows" description="No data matches the current filters." />}
          />
        </div>
      )}

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save report</DialogTitle>
            <DialogDescription>Save this definition to re-run and export later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="rpt-name" className="text-xs">Report name</Label>
            <Input id="rpt-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Monthly expenses by department" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={doSave}>Save report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
