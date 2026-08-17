-- Let athletes log an extra, unplanned session themselves (e.g. an extra
-- bike ride), tagged so the coach can tell it apart from what they
-- prescribed. The coach can see it but not edit or delete it — enforced at
-- the RLS level, not just hidden in the UI, since the coach's existing
-- "manages own sessions/session_exercises" policies otherwise grant
-- unconditional write access to every session in their own plans.

ALTER TABLE public.sessions
  ADD COLUMN is_client_added boolean NOT NULL DEFAULT false;

-- Split the coach's single FOR ALL policy into a read (untouched, still
-- covers everything) and three write policies that exclude athlete-added
-- rows.
DROP POLICY "coach manages own sessions" ON public.sessions;

CREATE POLICY "coach reads own sessions" ON public.sessions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id
      WHERE b.id = sessions.block_id AND p.coach_id = auth.uid())
  );
CREATE POLICY "coach inserts own sessions" ON public.sessions
  FOR INSERT TO authenticated WITH CHECK (
    is_client_added = false AND EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id
      WHERE b.id = sessions.block_id AND p.coach_id = auth.uid())
  );
CREATE POLICY "coach updates own coach-authored sessions" ON public.sessions
  FOR UPDATE TO authenticated USING (
    is_client_added = false AND EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id
      WHERE b.id = sessions.block_id AND p.coach_id = auth.uid())
  ) WITH CHECK (
    is_client_added = false AND EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id
      WHERE b.id = sessions.block_id AND p.coach_id = auth.uid())
  );
CREATE POLICY "coach deletes own coach-authored sessions" ON public.sessions
  FOR DELETE TO authenticated USING (
    is_client_added = false AND EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id
      WHERE b.id = sessions.block_id AND p.coach_id = auth.uid())
  );

CREATE POLICY "athlete inserts own extra sessions" ON public.sessions
  FOR INSERT TO authenticated WITH CHECK (
    is_client_added = true AND EXISTS (
      SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
      WHERE b.id = sessions.block_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "athlete updates own extra sessions" ON public.sessions
  FOR UPDATE TO authenticated USING (
    is_client_added = true AND EXISTS (
      SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
      WHERE b.id = sessions.block_id AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    is_client_added = true AND EXISTS (
      SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
      WHERE b.id = sessions.block_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "athlete deletes own extra sessions" ON public.sessions
  FOR DELETE TO authenticated USING (
    is_client_added = true AND EXISTS (
      SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
      WHERE b.id = sessions.block_id AND c.user_id = auth.uid()
    )
  );

-- Same split for session_exercises, keyed off the parent session's flag.
DROP POLICY "coach manages own session_exercises" ON public.session_exercises;

CREATE POLICY "coach reads own session_exercises" ON public.session_exercises
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id
      WHERE s.id = session_exercises.session_id AND p.coach_id = auth.uid())
  );
CREATE POLICY "coach inserts own session_exercises" ON public.session_exercises
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id
      WHERE s.id = session_exercises.session_id AND p.coach_id = auth.uid() AND s.is_client_added = false)
  );
CREATE POLICY "coach updates own coach-authored session_exercises" ON public.session_exercises
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id
      WHERE s.id = session_exercises.session_id AND p.coach_id = auth.uid() AND s.is_client_added = false)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id
      WHERE s.id = session_exercises.session_id AND p.coach_id = auth.uid() AND s.is_client_added = false)
  );
CREATE POLICY "coach deletes own coach-authored session_exercises" ON public.session_exercises
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id
      WHERE s.id = session_exercises.session_id AND p.coach_id = auth.uid() AND s.is_client_added = false)
  );

CREATE POLICY "athlete manages own extra session_exercises" ON public.session_exercises
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id
        JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
      WHERE s.id = session_exercises.session_id AND s.is_client_added = true AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id
        JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
      WHERE s.id = session_exercises.session_id AND s.is_client_added = true AND c.user_id = auth.uid()
    )
  );
