CREATE OR REPLACE FUNCTION public.touch_session_when_exercise_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  v_session_id := COALESCE(NEW.session_id, OLD.session_id);
  UPDATE public.sessions
  SET updated_at = now()
  WHERE id = v_session_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.touch_session_when_exercise_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_session_when_exercise_changes() FROM anon;
REVOKE ALL ON FUNCTION public.touch_session_when_exercise_changes() FROM authenticated;