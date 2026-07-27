-- Client profile additions: avatar, height/weight stats, file attachments.
--
-- Weight gets its own timestamped table (client_weight_logs) rather than a
-- column on clients, since the whole point is time-series comparison over
-- time — a single column can't hold history. Height stays a plain column on
-- clients since only a current value was requested.
--
-- Both coach_id and client_id are stored directly on the new tables (rather
-- than deriving coach_id via a join) to match the existing dual-access RLS
-- pattern used by client_exercise_1rm: a fast coach_id = auth.uid() check,
-- plus a join through clients.user_id for athlete self-access.

ALTER TABLE public.clients
  ADD COLUMN avatar_path text,
  ADD COLUMN height_cm numeric;

CREATE TABLE public.client_weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  value_kg numeric NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_weight_logs_client_id ON public.client_weight_logs(client_id, logged_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_weight_logs TO authenticated;
ALTER TABLE public.client_weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach can read own weight logs" ON public.client_weight_logs
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach can insert own weight logs" ON public.client_weight_logs
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach can update own weight logs" ON public.client_weight_logs
  FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach can delete own weight logs" ON public.client_weight_logs
  FOR DELETE TO authenticated USING (coach_id = auth.uid());

CREATE POLICY "athlete can read own weight logs" ON public.client_weight_logs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_weight_logs.client_id AND c.user_id = auth.uid())
  );
CREATE POLICY "athlete can insert own weight logs" ON public.client_weight_logs
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_weight_logs.client_id AND c.user_id = auth.uid())
  );
CREATE POLICY "athlete can update own weight logs" ON public.client_weight_logs
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_weight_logs.client_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_weight_logs.client_id AND c.user_id = auth.uid())
  );
CREATE POLICY "athlete can delete own weight logs" ON public.client_weight_logs
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_weight_logs.client_id AND c.user_id = auth.uid())
  );

CREATE TABLE public.client_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_attachments_client_id ON public.client_attachments(client_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_attachments TO authenticated;
ALTER TABLE public.client_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach can read own attachments" ON public.client_attachments
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach can insert own attachments" ON public.client_attachments
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach can delete own attachments" ON public.client_attachments
  FOR DELETE TO authenticated USING (coach_id = auth.uid());

CREATE POLICY "athlete can read own attachments" ON public.client_attachments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_attachments.client_id AND c.user_id = auth.uid())
  );
CREATE POLICY "athlete can insert own attachments" ON public.client_attachments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_attachments.client_id AND c.user_id = auth.uid())
  );
CREATE POLICY "athlete can delete own attachments" ON public.client_attachments
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_attachments.client_id AND c.user_id = auth.uid())
  );

-- Storage: two private buckets. Objects are keyed "{client_id}/{filename}" so
-- storage.foldername(name) gives the client_id to check against, without
-- needing a lookup table mapping storage paths back to clients.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('client-avatars', 'client-avatars', false, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('client-attachments', 'client-attachments', false, 26214400, ARRAY['image/jpeg','image/png','application/pdf']);

CREATE POLICY "coach can manage own client avatars" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.coach_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.coach_id = auth.uid()
    )
  );
CREATE POLICY "athlete can manage own avatar" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-avatars' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "coach can manage own client attachments" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.coach_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.coach_id = auth.uid()
    )
  );
CREATE POLICY "athlete can manage own attachments" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    bucket_id = 'client-attachments' AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id::text = (storage.foldername(name))[1] AND c.user_id = auth.uid()
    )
  );
