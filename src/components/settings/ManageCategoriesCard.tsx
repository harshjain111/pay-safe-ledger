import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { Tags, Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

export function ManageCategoriesCard() {
  const { isOwner, isAdmin, isAccountant } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: 'toggle' | 'delete' } | null>(null);

  const canManage = isOwner || isAdmin || isAccountant;

  useEffect(() => {
    if (canManage) fetchCategories();
  }, [canManage]);

  if (!canManage) return null;

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('custom_expense_categories')
      .select('*')
      .order('sort_order');
    if (!error && data) setCategories(data);
    setIsLoading(false);
  };

  const addCategory = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsAdding(true);
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0);
    const { error } = await supabase.from('custom_expense_categories').insert({
      name: trimmed,
      sort_order: maxOrder + 1,
    });
    if (error) {
      toast.error(error.message.includes('unique') ? 'Category already exists' : 'Failed to add category');
    } else {
      toast.success('Category added');
      setNewName('');
      fetchCategories();
    }
    setIsAdding(false);
  };

  const toggleActive = async (cat: Category) => {
    try {
      setBusy({ id: cat.id, action: 'toggle' });
      const { error } = await supabase
        .from('custom_expense_categories')
        .update({ is_active: !cat.is_active })
        .eq('id', cat.id);
      if (error) {
        toast.error('Failed to update');
      } else {
        await fetchCategories();
      }
    } finally {
      setBusy(null);
    }
  };

  const deleteCategory = async (cat: Category) => {
    try {
      setBusy({ id: cat.id, action: 'delete' });
      const { error } = await supabase
        .from('custom_expense_categories')
        .delete()
        .eq('id', cat.id);
      if (error) {
        toast.error('Cannot delete: category may be in use');
      } else {
        toast.success('Category deleted');
        await fetchCategories();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Tags className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Expense Categories
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">Add, remove or disable expense categories</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0 space-y-4">
        {/* Add new */}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category name"
            className="h-10 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          />
          <Button size="sm" onClick={addCategory} disabled={isAdding || !newName.trim()} className="shrink-0">
            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{cat.name}</span>
                  {!cat.is_active && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(cat)} disabled={busy?.id === cat.id} title={cat.is_active ? 'Disable' : 'Enable'}>
                    {busy?.id === cat.id && busy.action === 'toggle' ? <Loader2 className="h-4 w-4 animate-spin" /> : cat.is_active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteCategory(cat)} disabled={busy?.id === cat.id}>
                    {busy?.id === cat.id && busy.action === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
