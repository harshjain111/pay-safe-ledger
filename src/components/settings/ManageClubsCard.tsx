import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { Building2, Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';

interface Club {
  id: string;
  name: string;
  is_active: boolean;
}

export function ManageClubsCard() {
  const { isOwner, isAdmin, isAccountant } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: 'toggle' | 'delete' } | null>(null);

  const canManage = isOwner || isAdmin || isAccountant;

  useEffect(() => {
    if (canManage) fetchClubs();
  }, [canManage]);

  if (!canManage) return null;

  const fetchClubs = async () => {
    const { data, error } = await supabase
      .from('clubs')
      .select('*')
      .order('name');
    if (!error && data) setClubs(data);
    setIsLoading(false);
  };

  const addClub = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsAdding(true);
    const { error } = await supabase.from('clubs').insert({ name: trimmed });
    if (error) {
      toast.error(error.message.includes('unique') ? 'Club already exists' : 'Failed to add club');
    } else {
      toast.success('Club added');
      setNewName('');
      fetchClubs();
    }
    setIsAdding(false);
  };

  const toggleActive = async (club: Club) => {
    try {
      setBusy({ id: club.id, action: 'toggle' });
      const { error } = await supabase
        .from('clubs')
        .update({ is_active: !club.is_active })
        .eq('id', club.id);
      if (error) {
        toast.error('Failed to update');
      } else {
        await fetchClubs();
      }
    } finally {
      setBusy(null);
    }
  };

  const deleteClub = async (club: Club) => {
    try {
      setBusy({ id: club.id, action: 'delete' });
      const { error } = await supabase
        .from('clubs')
        .delete()
        .eq('id', club.id);
      if (error) {
        toast.error('Cannot delete: club may be in use');
      } else {
        toast.success('Club deleted');
        await fetchClubs();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Clubs
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">Manage clubs/venues for expense tracking</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New club name"
            className="h-10 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && addClub()}
          />
          <Button size="sm" onClick={addClub} disabled={isAdding || !newName.trim()} className="shrink-0">
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : clubs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No clubs added yet</p>
        ) : (
          <div className="space-y-2">
            {clubs.map((club) => (
              <div key={club.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{club.name}</span>
                  {!club.is_active && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(club)} disabled={busy?.id === club.id} title={club.is_active ? 'Disable' : 'Enable'}>
                    {busy?.id === club.id && busy.action === 'toggle' ? <Loader2 className="h-4 w-4 animate-spin" /> : club.is_active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteClub(club)} disabled={busy?.id === club.id}>
                    {busy?.id === club.id && busy.action === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
