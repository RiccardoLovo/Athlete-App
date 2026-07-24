
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated, anon;

DROP POLICY IF EXISTS "Deny role inserts" ON public.user_roles;
CREATE POLICY "Deny role inserts" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Deny role updates" ON public.user_roles;
CREATE POLICY "Deny role updates" ON public.user_roles FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny role deletes" ON public.user_roles;
CREATE POLICY "Deny role deletes" ON public.user_roles FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "Coaches manage workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "coach_all_workout_logs" ON public.workout_logs;

CREATE POLICY "Coaches manage own workout logs"
ON public.workout_logs FOR ALL TO authenticated
USING (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'))
WITH CHECK (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'));

DROP POLICY IF EXISTS "Athletes update own workout logs" ON public.workout_logs;
CREATE POLICY "Athletes update own workout logs"
ON public.workout_logs FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'athlete')
  AND client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'athlete')
  AND client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  AND coach_id = (SELECT coach_id FROM public.clients WHERE user_id = auth.uid() LIMIT 1)
);

DROP POLICY IF EXISTS "Deny athlete deletes on workout logs" ON public.workout_logs;
CREATE POLICY "Deny athlete deletes on workout logs"
ON public.workout_logs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid());
