-- Athletes can now add an exercise mid-workout: either an existing one
-- from the library (already readable — coach's own or global), or a
-- brand-new one they name on the spot. New exercises are attributed to
-- the athlete's OWN COACH (not the athlete), so they immediately behave
-- like any other exercise that coach owns — visible in their Knowledge
-- Bank, editable by them, publishable to the global library by them —
-- with `added_by_athlete` marking provenance for the "new, needs review"
-- badge and `reviewed_by_coach` letting the coach dismiss it.

ALTER TABLE public.session_exercises
  ADD COLUMN added_by_client boolean NOT NULL DEFAULT false;

ALTER TABLE public.exercises
  ADD COLUMN added_by_athlete boolean NOT NULL DEFAULT false,
  ADD COLUMN reviewed_by_coach boolean NOT NULL DEFAULT false;

-- Athletes may create a private exercise "as" their own coach.
CREATE POLICY "Athletes create exercises for their coach" ON public.exercises
  FOR INSERT TO authenticated
  WITH CHECK (
    is_global = false
    AND added_by_athlete = true
    AND created_by IN (SELECT coach_id FROM public.clients WHERE user_id = auth.uid())
  );

-- Coaches previously couldn't publish their own exercise to the global
-- library at all (the old update policy required is_global to stay
-- false). Replace it with one that lets a coach freely edit — including
-- publish/unpublish — anything they own.
DROP POLICY "Update own custom exercises" ON public.exercises;
CREATE POLICY "Update own exercises" ON public.exercises
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Athletes may add an exercise entry to ANY of their own sessions
-- (previously only athlete-added extra sessions were writable at all),
-- as long as it's flagged as athlete-added.
CREATE POLICY "Athletes add exercises to own sessions" ON public.session_exercises
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by_client = true
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      JOIN public.clients c ON c.id = p.athlete_id
      WHERE s.id = session_exercises.session_id AND c.user_id = auth.uid()
    )
  );

-- ...and may remove one they added themselves (undo a mistake), but never
-- a coach-authored row.
CREATE POLICY "Athletes delete own added exercises" ON public.session_exercises
  FOR DELETE TO authenticated
  USING (
    added_by_client = true
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      JOIN public.clients c ON c.id = p.athlete_id
      WHERE s.id = session_exercises.session_id AND c.user_id = auth.uid()
    )
  );
