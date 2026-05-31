-- Add RLS policies for expense-proofs storage bucket

-- Policy: Allow authenticated users to read expense proofs
CREATE POLICY "Authenticated users can view expense proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'expense-proofs');

-- Policy: Allow staff to upload their own expense proofs
CREATE POLICY "Staff can upload expense proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'expense-proofs' AND
  auth.uid() IS NOT NULL
);

-- Policy: Allow users to update their own uploaded files
CREATE POLICY "Users can update their own expense proofs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'expense-proofs' AND
  owner = auth.uid()
);

-- Policy: Allow users to delete their own uploaded files
CREATE POLICY "Users can delete their own expense proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'expense-proofs' AND
  owner = auth.uid()
);