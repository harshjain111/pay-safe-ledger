import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Upload, Download, Trash2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import {
  uploadStaffDocument,
  getStaffDocumentSignedUrl,
  deleteStaffDocumentFile,
} from '@/lib/staff-uploads';
import type { StaffDocument, StaffDocumentType } from '@/types/database';

const DOC_TYPES: { value: StaffDocumentType; label: string }[] = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'bank_details', label: 'Bank Details' },
  { value: 'education', label: 'Educational Certificate' },
  { value: 'employment_contract', label: 'Employment Contract' },
  { value: 'experience_certificate', label: 'Experience Certificate' },
  { value: 'other', label: 'Other' },
];

interface Props {
  staffId: string;
}

export function StaffDocumentsCard({ staffId }: Props) {
  const { user, isOwner, isAdmin } = useAuth();
  const canManage = isOwner || isAdmin;
  const [docs, setDocs] = useState<StaffDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // form
  const [docType, setDocType] = useState<StaffDocumentType>('aadhaar');
  const [docLabel, setDocLabel] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => { fetchDocs(); }, [staffId]);

  const fetchDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_documents')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false });
    if (!error && data) setDocs(data as StaffDocument[]);
    setLoading(false);
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: 'Pick a file', variant: 'destructive' });
      return;
    }
    try {
      setUploading(true);
      const { path } = await uploadStaffDocument(staffId, file);
      const { error } = await supabase.from('staff_documents').insert({
        staff_id: staffId,
        doc_type: docType,
        doc_label: docLabel.trim() || null,
        doc_number: docNumber.trim() || null,
        file_url: path,
        file_name: file.name,
        notes: notes.trim() || null,
        uploaded_by: user?.id,
      });
      if (error) throw error;
      toast({ title: 'Document uploaded' });
      setFile(null);
      setDocLabel('');
      setDocNumber('');
      setNotes('');
      const input = document.getElementById('doc-file') as HTMLInputElement | null;
      if (input) input.value = '';
      fetchDocs();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (path: string) => {
    try {
      const url = await getStaffDocumentSignedUrl(path);
      window.open(url, '_blank');
    } catch (e: any) {
      toast({ title: 'Cannot open document', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (doc: StaffDocument) => {
    if (!confirm('Delete this document?')) return;
    await deleteStaffDocumentFile(doc.file_url);
    await supabase.from('staff_documents').delete().eq('id', doc.id);
    toast({ title: 'Document deleted' });
    fetchDocs();
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" /> Documents
        </CardTitle>
        <CardDescription>Aadhaar, PAN, Bank, Education, Contract & more. All optional.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canManage && (
          <div className="space-y-3 p-4 rounded-lg border border-dashed bg-muted/30">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as StaffDocumentType)}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Label (optional)</Label>
                <Input value={docLabel} onChange={(e) => setDocLabel(e.target.value)} placeholder="e.g. SSC Marksheet" />
              </div>
              {(docType === 'aadhaar' || docType === 'pan') && (
                <div className="space-y-2">
                  <Label>{docType === 'aadhaar' ? 'Aadhaar Number' : 'PAN Number'}</Label>
                  <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="Optional" />
                </div>
              )}
              <div className="space-y-2">
                <Label>File (max 5MB)</Label>
                <Input id="doc-file" type="file" accept="image/*,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={handleUpload} disabled={uploading || !file} className="gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload Document
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium capitalize">{DOC_TYPES.find(t => t.value === d.doc_type)?.label ?? d.doc_type}</span>
                    {d.doc_label && <span className="text-sm text-muted-foreground">· {d.doc_label}</span>}
                  </div>
                  {d.doc_number && <p className="text-xs text-muted-foreground">No: {d.doc_number}</p>}
                  {d.file_name && <p className="text-xs text-muted-foreground truncate">{d.file_name}</p>}
                  <p className="text-xs text-muted-foreground">{format(new Date(d.created_at), 'PP')}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleView(d.file_url)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(d)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
