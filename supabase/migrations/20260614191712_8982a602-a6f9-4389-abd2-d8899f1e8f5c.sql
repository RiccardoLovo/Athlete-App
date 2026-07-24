DROP POLICY IF EXISTS "admins manage all session_exercises" ON public.session_exercises;
DROP POLICY IF EXISTS "Admin all access" ON public.session_exercises;

CREATE POLICY "admins manage all session_exercises"
ON public.session_exercises
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
