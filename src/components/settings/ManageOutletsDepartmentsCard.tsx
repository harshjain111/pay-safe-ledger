import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { Store, Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';

type MasterTable = 'outlets' | 'departments';

interface MasterRow {
  id: string;
  name: string;
  is_active: boolean;
}

function MasterList({
  table,
  singular,
  placeholder,
}: {
  table: MasterTable;
  singular: string;
  placeholder: string;
}) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: 'toggle' | 'delete' } | null>(null);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.from(table).select('id, name, is_active').order('name');
    if (!error && data) setRows(data as MasterRow[]);
    setIsLoading(false);
  }, [table]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const addRow = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsAdding(true);
    const { error } = await supabase.from(table).insert({ name: trimmed });
    if (error) {
      toast.error(error.message.includes('unique') ? `${singular} already exists` : `Failed to add ${singular.toLowerCase()}`);
    } else {
      toast.success(`${singular} added`);
      setNewName('');
      fetchRows();
    }
    setIsAdding(false);
  };

  const toggleActive = async (row: MasterRow) => {
    try {
      setBusy({ id: row.id, action: 'toggle' });
      const { error } = await supabase.from(table).update({ is_active: !row.is_active }).eq('id', row.id);
      if (error) toast.error('Failed to update');
      else await fetchRows();
    } finally {
      setBusy(null);
    }
  };

  const deleteRow = async (row: MasterRow) => {
    try {
      setBusy({ id: row.id, action: 'delete' });
      const { error } = await supabase.from(table).delete().eq('id', row.id);
      if (error) toast.error(`Cannot delete: ${singular.toLowerCase()} may be assigned to staff`);
      else {
        toast.success(`${singular} deleted`);
        await fetchRows();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder}
          className="h-10 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && addRow()}
        />
        <Button size="sm" onClick={addRow} disabled={isAdding || !newName.trim()} className="shrink-0">
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No {singular.toLowerCase()}s added yet</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{row.name}</span>
                {!row.is_active && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => toggleActive(row)}
                  disabled={busy?.id === row.id}
                  title={row.is_active ? 'Disable' : 'Enable'}
                >
                  {busy?.id === row.id && busy.action === 'toggle' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : row.is_active ? (
                    <ToggleRight className="h-4 w-4 text-primary" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => deleteRow(row)}
                  disabled={busy?.id === row.id}
                  aria-label={`Delete ${row.name}`}
                >
                  {busy?.id === row.id && busy.action === 'delete' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManageOutletsDepartmentsCard() {
  const { isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Store className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Outlets &amp; Departments
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Master lists used when enrolling staff outlet-wise and department-wise
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium mb-2">Outlets</p>
          <MasterList table="outlets" singular="Outlet" placeholder="New outlet name" />
        </div>
        <div>
          <p className="text-sm font-medium mb-2">Departments</p>
          <MasterList table="departments" singular="Department" placeholder="New department name" />
        </div>
      </CardContent>
    </Card>
  );
}
