import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Shield, ShieldCheck, Plus, Pencil, Trash2, Check, Loader2, Users, Lock } from 'lucide-react';
import { toast } from '@/lib/toast';
import { PERMISSION_MODULES, ALL_PERMISSIONS } from '@/lib/permissions';

interface Template {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  is_owner: boolean;
  is_builtin: boolean;
  role_key: string | null;
}
interface UserRight {
  userId: string;
  role: string;
  name: string;
  templateId: string | null;
  granted: string[];
  revoked: string[];
}

// ---- grouped permission toggle grid (shared by editor + overrides) ---------
function PermissionGrid({
  value, onChange, disabled,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const toggle = (key: string) => {
    if (disabled) return;
    const next = new Set(value);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange(next);
  };
  const toggleModule = (keys: string[], on: boolean) => {
    if (disabled) return;
    const next = new Set(value);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {PERMISSION_MODULES.map((m) => {
        const keys = m.permissions.map((p) => p.key);
        const allOn = keys.every((k) => value.has(k));
        return (
          <div key={m.module} className="rounded-lg border p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.module}</p>
              {!disabled && (
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => toggleModule(keys, !allOn)}>
                  {allOn ? 'Clear' : 'All'}
                </button>
              )}
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {m.permissions.map((p) => {
                const on = value.has(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => toggle(p.key)}
                    disabled={disabled}
                    className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors', on ? 'bg-primary/10' : 'hover:bg-muted', disabled && 'opacity-70')}
                  >
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- template create / edit dialog -----------------------------------------
function TemplateDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Template | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const isOwnerTemplate = editing?.is_owner ?? false;

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setDescription(editing?.description ?? '');
    setPerms(new Set(editing?.is_owner ? ALL_PERMISSIONS : editing?.permissions ?? []));
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || null, permissions: [...perms] };
      if (editing) {
        const { error } = await supabase.from('rights_templates').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rights_templates').insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
      toast.success(editing ? 'Template updated' : 'Template created');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      toast.error(/duplicate|unique/i.test(msg) ? 'A template with that name already exists' : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
          <DialogDescription>Toggle the permissions this template grants, grouped by module.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Branch Manager" disabled={editing?.is_builtin} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {isOwnerTemplate ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" /> The Owner template always has every permission and can’t be limited.
            </div>
          ) : (
            <PermissionGrid value={perms} onChange={setPerms} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || isOwnerTemplate}>{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- per-user override dialog ----------------------------------------------
function OverrideDialog({
  open, onOpenChange, userRight, template, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userRight: UserRight | null;
  template: Template | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [effective, setEffective] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const isOwnerTemplate = template?.is_owner ?? false;

  useEffect(() => {
    if (!open || !userRight) return;
    const base = new Set<string>(template?.is_owner ? ALL_PERMISSIONS : template?.permissions ?? []);
    userRight.granted.forEach((g) => base.add(g));
    userRight.revoked.forEach((r) => base.delete(r));
    setEffective(base);
  }, [open, userRight, template]);

  const submit = async () => {
    if (!userRight) return;
    const tmplPerms = new Set(template?.permissions ?? []);
    const granted = [...effective].filter((k) => !tmplPerms.has(k));
    const revoked = [...tmplPerms].filter((k) => !effective.has(k));
    setSaving(true);
    try {
      const { error } = await supabase.from('user_permissions').upsert(
        { user_id: userRight.userId, template_id: userRight.templateId, granted, revoked, updated_by: user?.id ?? null },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      toast.success('Permissions updated');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize permissions · {userRight?.name}</DialogTitle>
          <DialogDescription>Overrides on top of the assigned template. Differences are saved as per-user grants/revokes.</DialogDescription>
        </DialogHeader>
        {isOwnerTemplate ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" /> Owner-template users always have every permission.
          </div>
        ) : (
          <PermissionGrid value={effective} onChange={setEffective} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || isOwnerTemplate}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RightsTemplates() {
  const { can } = useAuth();
  const canManage = can('users.manage');

  const [templates, setTemplates] = useState<Template[]>([]);
  const [userRights, setUserRights] = useState<UserRight[]>([]);
  const [loading, setLoading] = useState(true);
  const [tplDialog, setTplDialog] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [overrideUser, setOverrideUser] = useState<UserRight | null>(null);

  const reloadTemplates = async () => {
    const { data } = await supabase
      .from('rights_templates')
      .select('id, name, description, permissions, is_owner, is_builtin, role_key')
      .order('is_builtin', { ascending: false })
      .order('name');
    setTemplates((data ?? []) as Template[]);
  };

  const reloadUsers = async () => {
    const [roleRes, upRes] = await Promise.all([
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('user_permissions').select('user_id, template_id, granted, revoked'),
    ]);
    const roleRows = (roleRes.data ?? []) as { user_id: string; role: string }[];
    const ids = roleRows.map((r) => r.user_id);
    const staffRes = ids.length
      ? await supabase.from('staff').select('user_id, full_name').in('user_id', ids)
      : { data: [] as { user_id: string; full_name: string }[] };
    const nameById = new Map((staffRes.data ?? []).map((s) => [s.user_id, s.full_name] as const));
    const upById = new Map(
      ((upRes.data ?? []) as { user_id: string; template_id: string | null; granted: string[]; revoked: string[] }[]).map((u) => [u.user_id, u] as const),
    );
    setUserRights(
      roleRows.map((r) => {
        const up = upById.get(r.user_id);
        return {
          userId: r.user_id,
          role: r.role,
          name: nameById.get(r.user_id) ?? `${r.role.charAt(0).toUpperCase()}${r.role.slice(1)} user`,
          templateId: up?.template_id ?? null,
          granted: up?.granted ?? [],
          revoked: up?.revoked ?? [],
        };
      }),
    );
  };

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    (async () => { setLoading(true); await Promise.all([reloadTemplates(), reloadUsers()]); setLoading(false); })();
  }, [canManage]);

  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const assignTemplate = async (ur: UserRight, templateId: string) => {
    const { error } = await supabase.from('user_permissions').upsert(
      { user_id: ur.userId, template_id: templateId, granted: [], revoked: [] },
      { onConflict: 'user_id' },
    );
    if (error) { toast.error(error.message); return; }
    toast.success('Template assigned');
    reloadUsers();
  };

  const deleteTemplate = async (t: Template) => {
    const { error } = await supabase.from('rights_templates').delete().eq('id', t.id);
    if (error) { toast.error('Could not delete — it may be assigned to users'); return; }
    toast.success('Template deleted');
    reloadTemplates();
  };

  if (!canManage) {
    return <EmptyState icon={Shield} title="Access Denied" description="You need the “Manage users & rights” permission to view this page." />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Rights & Templates" description="Define reusable permission templates and assign them to users." />

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates" className="gap-1.5"><ShieldCheck className="h-4 w-4" />Templates</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-4 w-4" />User Rights</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setTplDialog(true); }}>
              <Plus className="h-4 w-4" /> New template
            </Button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{t.name}</span>
                          {t.is_builtin && <Badge variant="outline" className="text-[10px]">Built-in</Badge>}
                        </div>
                        {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t.is_owner ? 'All permissions' : `${t.permissions.length} permission${t.permissions.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit" onClick={() => { setEditing(t); setTplDialog(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!t.is_builtin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete “{t.name}”?</AlertDialogTitle>
                                <AlertDialogDescription>Users assigned to it will fall back to their role’s default permissions.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteTemplate(t)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-2">
              {userRights.map((ur) => {
                const tmpl = ur.templateId ? templateById.get(ur.templateId) : null;
                const overrideCount = ur.granted.length + ur.revoked.length;
                return (
                  <Card key={ur.userId}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{ur.name}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{ur.role}</Badge>
                          {overrideCount > 0 && <Badge variant="outline" className="text-[10px]">{overrideCount} override{overrideCount === 1 ? '' : 's'}</Badge>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Select value={ur.templateId ?? ''} onValueChange={(v) => assignTemplate(ur, v)}>
                          <SelectTrigger className="h-8 w-[11rem]" aria-label="Assign template"><SelectValue placeholder="Assign template" /></SelectTrigger>
                          <SelectContent className="bg-popover">
                            {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" disabled={!tmpl || tmpl.is_owner} onClick={() => setOverrideUser(ur)}>Customize</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <TemplateDialog open={tplDialog} onOpenChange={setTplDialog} editing={editing} onSaved={reloadTemplates} />
      <OverrideDialog
        open={!!overrideUser}
        onOpenChange={(o) => !o && setOverrideUser(null)}
        userRight={overrideUser}
        template={overrideUser?.templateId ? templateById.get(overrideUser.templateId) ?? null : null}
        onSaved={reloadUsers}
      />
    </div>
  );
}
