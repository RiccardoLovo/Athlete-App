
-- 1. Backfill: link clients.user_id by matching auth.users.email
UPDATE public.clients c
SET user_id = u.id
FROM auth.users u
WHERE c.user_id IS NULL
  AND c.email IS NOT NULL
  AND lower(c.email) = lower(u.email);

-- 2. Athlete self-access policies for client_exercise_1rm
CREATE POLICY "Athlete reads own 1rm"
  ON public.client_exercise_1rm FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_exercise_1rm.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Athlete inserts own 1rm"
  ON public.client_exercise_1rm FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_exercise_1rm.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Athlete updates own 1rm"
  ON public.client_exercise_1rm FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_exercise_1rm.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_exercise_1rm.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Athlete deletes own 1rm"
  ON public.client_exercise_1rm FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_exercise_1rm.client_id AND c.user_id = auth.uid()));
