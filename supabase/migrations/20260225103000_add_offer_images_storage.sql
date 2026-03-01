-- Optional offer image support (stored in Supabase Storage)

ALTER TABLE public.offres
  ADD COLUMN IF NOT EXISTS image_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'offer-images',
  'offer-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'offer_images_public_read'
  ) THEN
    CREATE POLICY offer_images_public_read
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'offer-images');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'offer_images_insert_own'
  ) THEN
    CREATE POLICY offer_images_insert_own
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'offer-images'
      AND (storage.foldername(name))[1] = 'business'
      AND (storage.foldername(name))[3] = 'offers'
      AND public.owns_business(((storage.foldername(name))[2])::uuid)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'offer_images_update_own'
  ) THEN
    CREATE POLICY offer_images_update_own
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'offer-images'
      AND (storage.foldername(name))[1] = 'business'
      AND (storage.foldername(name))[3] = 'offers'
      AND public.owns_business(((storage.foldername(name))[2])::uuid)
    )
    WITH CHECK (
      bucket_id = 'offer-images'
      AND (storage.foldername(name))[1] = 'business'
      AND (storage.foldername(name))[3] = 'offers'
      AND public.owns_business(((storage.foldername(name))[2])::uuid)
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'offer_images_delete_own'
  ) THEN
    CREATE POLICY offer_images_delete_own
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'offer-images'
      AND (storage.foldername(name))[1] = 'business'
      AND (storage.foldername(name))[3] = 'offers'
      AND public.owns_business(((storage.foldername(name))[2])::uuid)
    );
  END IF;
END $$;
