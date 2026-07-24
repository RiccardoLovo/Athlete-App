CREATE OR REPLACE FUNCTION public.touch_session_when_exercise_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

DROP TRIGGER IF EXISTS touch_session_on_exercise_change ON public.session_exercises;
CREATE TRIGGER touch_session_on_exercise_change
AFTER INSERT OR UPDATE OR DELETE ON public.session_exercises
FOR EACH ROW
EXECUTE FUNCTION public.touch_session_when_exercise_changes();