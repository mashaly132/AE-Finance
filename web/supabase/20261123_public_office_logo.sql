-- 2026-11-23: make the office logo readable on the login screen without login.
-- Only authenticated active office members may replace the public image.
-- The bucket must contain branding only; private finance data stays in separate buckets.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('ae-office-brand','ae-office-brand',TRUE,3145728,ARRAY['image/png','image/jpeg','image/webp']::text[])
ON CONFLICT(id) DO UPDATE
SET public=EXCLUDED.public,
    file_size_limit=EXCLUDED.file_size_limit,
    allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ae_office_brand_logo_write" ON storage.objects;
CREATE POLICY "ae_office_brand_logo_write"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id='ae-office-brand' AND name='office-logo'
  AND EXISTS (
    SELECT 1 FROM public.office_members member
    WHERE member.user_id=(SELECT auth.uid()) AND member.active
  )
)
WITH CHECK (
  bucket_id='ae-office-brand' AND name='office-logo'
  AND EXISTS (
    SELECT 1 FROM public.office_members member
    WHERE member.user_id=(SELECT auth.uid()) AND member.active
  )
);
