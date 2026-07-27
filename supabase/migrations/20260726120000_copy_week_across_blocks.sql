-- Replace copy_week with a version that takes explicit source AND target
-- blocks (previously both source and target were pinned to the same block,
-- so the coach could only ever copy within one block, and the client picked
-- the source implicitly from local UI state instead of asking the user).

DROP FUNCTION IF EXISTS public.copy_week(uuid, int, int);

CREATE OR REPLACE FUNCTION public.copy_week(
  _source_block_id uuid,
  _source_week int,
  _target_block_id uuid,
  _target_week int
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; new_session_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id
    WHERE b.id = _source_block_id AND p.coach_id = auth.uid()
  ) OR NOT EXISTS (
    SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id
    WHERE b.id = _target_block_id AND p.coach_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _source_block_id = _target_block_id AND _source_week = _target_week THEN RETURN; END IF;
  DELETE FROM public.sessions WHERE block_id = _target_block_id AND week_number = _target_week;
  FOR s IN SELECT * FROM public.sessions WHERE block_id = _source_block_id AND week_number = _source_week LOOP
    INSERT INTO public.sessions (block_id, week_number, day_of_week, name, notes, status, is_optional, training_category_tags, body_region)
    VALUES (_target_block_id, _target_week, s.day_of_week, s.name, s.notes, COALESCE(s.status,'planned'), s.is_optional, s.training_category_tags, s.body_region)
    RETURNING id INTO new_session_id;
    INSERT INTO public.session_exercises
      (session_id, exercise_id, order_index, sets, reps, notes, group_id, group_type, target_mode, rpe, load_mode, load_value, rest_sec, distance_km, duration_min, pace, hr_zone, tempo, prescription)
    SELECT new_session_id, exercise_id, order_index, sets, reps, notes, group_id, group_type, target_mode, rpe, load_mode, load_value, rest_sec, distance_km, duration_min, pace, hr_zone, tempo, prescription
      FROM public.session_exercises WHERE session_id = s.id;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.copy_week(uuid, int, uuid, int) TO authenticated;
