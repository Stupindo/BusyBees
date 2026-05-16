-- Add photo_url column to chore_instances if it doesn't exist
ALTER TABLE public.chore_instances
ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

-- Create the public bucket for chore photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('chore-photos', 'chore-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for the bucket objects
-- (Assuming RLS is enabled on storage.objects by default, we just add policies)

-- Policy: Allow authenticated users to view all photos
CREATE POLICY "Allow authenticated users to read chore photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chore-photos');

-- Policy: Allow authenticated users to insert/upload photos
CREATE POLICY "Allow authenticated users to insert chore photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chore-photos');

-- Policy: Allow authenticated users to update/delete their own uploads if necessary (optional but good practice)
CREATE POLICY "Allow authenticated users to update chore photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chore-photos');

CREATE POLICY "Allow authenticated users to delete chore photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chore-photos');
