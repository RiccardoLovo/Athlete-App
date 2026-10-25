-- workout_blocks' policies joined session_exercises -> sessions ->
-- training_blocks -> training_plans inline. Every one of those tables has
-- its own RLS policies, which Postgres recursively inlines into this
-- policy's subquery, so a query against an (empty!) workout_blocks table
-- was taking ~1.1s to PLAN and ~0.9s to execute — enough to hit the
-- statement timeout in the app and make every "add block" click fail.
--
-- Fix: do the ownership lookup inside SECURITY DEFINER helpers, the same
-- pattern public.has_role() already uses here. The inner joins then run as
-- the function owner, skipping RLS on those tables entirely, so the policy
-- is a single cheap boolean instead of a nested policy tree.

CREATE OR REPLACE FUNCTION public.coach_owns_session_exercise(_se_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
    WHERE se.id = _se_id AND p.coach_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.athlete_owns_session_exercise(_se_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      JOIN public.clients c ON c.id = p.athlete_id
    WHERE se.id = _se_id AND c.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.coach_owns_session_exercise(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.athlete_owns_session_exercise(uuid) TO authenticated;

DROP POLICY IF EXISTS "coach manages own workout_blocks" ON public.workout_blocks;
DROP POLICY IF EXISTS "athlete reads own workout_blocks" ON public.workout_blocks;
DROP POLICY IF EXISTS "Admin all access" ON public.workout_blocks;

CREATE POLICY "coach manages own workout_blocks" ON public.workout_blocks
  FOR ALL TO authenticated
  USING (
    public.coach_owns_session_exercise(session_exercise_id)
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.coach_owns_session_exercise(session_exercise_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "athlete reads own workout_blocks" ON public.workout_blocks
  FOR SELECT TO authenticated
  USING (public.athlete_owns_session_exercise(session_exercise_id));
