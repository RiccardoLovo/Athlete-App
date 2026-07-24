
-- Fast helpers: bypass RLS on joined tables, single query each.
CREATE OR REPLACE FUNCTION public.can_manage_session_exercise(_se_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      WHERE se.id = _se_id
        AND p.coach_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_session_exercise(_se_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_manage_session_exercise(_se_id)
    OR EXISTS (
      SELECT 1
      FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      JOIN public.clients c ON c.id = p.athlete_id
      WHERE se.id = _se_id
        AND c.user_id = auth.uid()
    );
$$;

-- Replace slow policies on prescription_intervals
DROP POLICY IF EXISTS "Admins manage all prescription intervals" ON public.prescription_intervals;
DROP POLICY IF EXISTS "Athletes view their interval prescriptions" ON public.prescription_intervals;
DROP POLICY IF EXISTS "Coaches manage intervals in their plans" ON public.prescription_intervals;

CREATE POLICY "View intervals"
ON public.prescription_intervals
FOR SELECT
TO authenticated
USING (public.can_view_session_exercise(session_exercise_id));

CREATE POLICY "Manage intervals"
ON public.prescription_intervals
FOR ALL
TO authenticated
USING (public.can_manage_session_exercise(session_exercise_id))
WITH CHECK (public.can_manage_session_exercise(session_exercise_id));
