import { supabase } from '@/integrations/supabase/client';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function uploadStaffPhoto(staffId: string, file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new Error('Photo must be under 5MB');
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${staffId}/photo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('staff-photos')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('staff-photos').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadStaffDocument(staffId: string, file: File): Promise<{ path: string; url: string }> {
  if (file.size > MAX_FILE_SIZE) throw new Error('File must be under 5MB');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${staffId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from('staff-documents')
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return { path, url: path };
}

export async function getStaffDocumentSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('staff-documents')
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteStaffDocumentFile(path: string): Promise<void> {
  await supabase.storage.from('staff-documents').remove([path]);
}
