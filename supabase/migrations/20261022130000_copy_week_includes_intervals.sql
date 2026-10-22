-- "Copy Week" silently dropped every interval/template exercise's
-- round-by-round prescription (prescription_intervals), since the previous
-- version only bulk-copied session_exercises. Any week copied from a
-- source week that had Fartlek/Pyramid/RSA-style round data ended up with
-- the exercise shell (name, sets, target_mode, ...) but zero rounds —
-- rendering as an apparently "empty" interval exercise downstream.
--
-- Fixed by looping per session_exercise (instead of one bulk INSERT...
-- SELECT) so each new row's id is known and its prescription_intervals
-- can be copied across too. Also carries over template_generated_at, so a
-- copied template-generated exercise keeps showing as already-generated
-- instead of re-offering the "Generate from template" button.

CREATE OR REPLACE FUNCTION public.copy_week(
  _source_block_id uuid,
  _source_week int,
  _target_block_id uuid,
  _target_week int
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; se record; new_session_id uuid; new_se_id uuid;
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

    FOR se IN SELECT * FROM public.session_exercises WHERE session_id = s.id ORDER BY order_index LOOP
      INSERT INTO public.session_exercises
        (session_id, exercise_id, order_index, sets, reps, notes, group_id, group_type, target_mode, rpe, load_mode, load_value, rest_sec, distance_km, duration_min, pace, hr_zone, tempo, prescription, template_generated_at)
      VALUES
        (new_session_id, se.exercise_id, se.order_index, se.sets, se.reps, se.notes, se.group_id, se.group_type, se.target_mode, se.rpe, se.load_mode, se.load_value, se.rest_sec, se.distance_km, se.duration_min, se.pace, se.hr_zone, se.tempo, se.prescription, se.template_generated_at)
      RETURNING id INTO new_se_id;

      INSERT INTO public.prescription_intervals
        (session_exercise_id, order_index, label, target_value, target_unit, pace_per_km, hr_zone, watts, cadence, stroke, intensity, rest_seconds, rest_type)
      SELECT new_se_id, order_index, label, target_value, target_unit, pace_per_km, hr_zone, watts, cadence, stroke, intensity, rest_seconds, rest_type
        FROM public.prescription_intervals WHERE session_exercise_id = se.id;
    END LOOP;
  END LOOP;
END $$;
