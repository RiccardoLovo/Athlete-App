-- Fix a column-shadowing bug in the storage.objects policies added by
-- 20260727090000: inside "EXISTS (SELECT ... FROM public.clients c WHERE
-- ...(storage.foldername(name))[1]...)", the unqualified `name` resolved to
-- clients.name (the client's display name) instead of storage.objects.name
-- (the file path) — clients also has a `name` column, so Postgres bound the
-- reference to the closer, inner-scope column. This made every policy
-- effectively unmatchable, since a folder-path UUID never equals a client's
-- display name, and caused every avatar/attachment upload to be rejected by
-- RLS regardless of ownership. Fixing by qualifying the reference as
-- storage.objects.name explicitly.

DROP POLICY "coach can manage own client avatars" ON storage.objects;
DROP POLICY "athlete can manage own avatar" ON storage.objects;
DROP POLICY "coach can manage own client attachments" ON storage.objects;
DROP POLICY "athlete can manage own attachments" ON storage.objects;

CREATE POLICY "coach can manage own client avatars" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.coach_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.coach_id = auth.uid()
    )
  );
CREATE POLICY "athlete can manage own avatar" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "coach can manage own client attachments" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.coach_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.coach_id = auth.uid()
    )
  );
CREATE POLICY "athlete can manage own attachments" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1] AND c.user_id = auth.uid()
    )
  );
