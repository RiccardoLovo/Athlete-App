-- Athletes could only read global exercises or ones they'd personally
-- created (never true, since athletes don't create exercises) — any custom
-- exercise a coach made for their own programming was invisible to their
-- athletes via RLS, silently dropping the embedded exercises(...) join and
-- showing as "Exercise removed" in the athlete UI even though the row and
-- the reference were both fine.

DROP POLICY "Read global or own exercises" ON public.exercises;

CREATE POLICY "Read global, own, or coach's exercises"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (
    is_global = true
    OR created_by = auth.uid()
    OR created_by IN (
      SELECT coach_id FROM public.clients WHERE user_id = auth.uid()
    )
  );
