
-- 1. Drop all permissive anon policies
DROP POLICY IF EXISTS "Anyone can read invite" ON public.client_invites;
DROP POLICY IF EXISTS "Public can read clients" ON public.clients;
DROP POLICY IF EXISTS "Public can read exercises" ON public.exercises;
DROP POLICY IF EXISTS "Public can read mesocycles" ON public.mesocycles;
DROP POLICY IF EXISTS "Public can read sessions" ON public.sessions;
DROP POLICY IF EXISTS "Public can read session_exercises" ON public.session_exercises;
DROP POLICY IF EXISTS "Public can read workout_logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Public can read exercise_logs" ON public.exercise_logs;
DROP POLICY IF EXISTS "Public can insert workout_logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Public can insert exercise_logs" ON public.exercise_logs;

-- 2. Revoke anon table grants
REVOKE ALL ON public.client_invites FROM anon;
REVOKE ALL ON public.clients FROM anon;
REVOKE ALL ON public.exercises FROM anon;
REVOKE ALL ON public.mesocycles FROM anon;
REVOKE ALL ON public.sessions FROM anon;
REVOKE ALL ON public.session_exercises FROM anon;
REVOKE ALL ON public.workout_logs FROM anon;
REVOKE ALL ON public.exercise_logs FROM anon;

-- 3. Safe invite lookup for the public signup-by-link page
CREATE OR REPLACE FUNCTION public.get_invite_info(_token text)
RETURNS TABLE(valid boolean, used boolean, client_name text, coach_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (i.id IS NOT NULL) AS valid,
    (i.used_at IS NOT NULL) AS used,
    c.name AS client_name,
    co.name AS coach_name
  FROM public.client_invites i
  LEFT JOIN public.clients c ON c.id = i.client_id
  LEFT JOIN public.coaches co ON co.id = i.coach_id
  WHERE i.token = _token
  LIMIT 1;
$$;

-- 4. Lock down EXECUTE on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_coach() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_invite_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_info(text) TO anon, authenticated;
