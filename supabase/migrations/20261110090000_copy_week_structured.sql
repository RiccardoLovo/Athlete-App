-- copy_week had fallen behind three later migrations, so copying a week
-- silently downgraded it:
--
--   * workout_blocks was never referenced — every structured workout lost its
--     blocks entirely, and its rounds reappeared as a flat list detached from
--     the block they belonged to.
--   * prescription_intervals lost rest_mode and rest_ratio, so a 1:1 ratio
--     rest became no rest at all.
--   * session_exercises lost tags, so intervals/tempo/easy/long were dropped.
--
-- That made Copy Week a trap: build a week with blocks, copy it forward, and
-- the structure is gone. It is also why there are six empty blocks and no
-- structured workouts worth copying.
--
-- Deliberately NOT carried: added_by_client. That flag means "the athlete
-- added this to their own session" and drives the review prompts. Once a
-- coach copies the week forward they are prescribing it, so the copy is the
-- coach's and should not re-raise a review for something already handled.

CREATE OR REPLACE FUNCTION public.copy_week(
  _source_block_id uuid, _source_week integer,
  _target_block_id uuid, _target_week integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record; se record; wb record;
  new_session_id uuid; new_se_id uuid; new_wb_id uuid;
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

  FOR s IN SELECT * FROM public.sessions
            WHERE block_id = _source_block_id AND week_number = _source_week LOOP
    INSERT INTO public.sessions
      (block_id, week_number, day_of_week, name, notes, status, is_optional,
       training_category_tags, body_region)
    VALUES
      (_target_block_id, _target_week, s.day_of_week, s.name, s.notes,
       COALESCE(s.status,'planned'), s.is_optional, s.training_category_tags, s.body_region)
    RETURNING id INTO new_session_id;

    FOR se IN SELECT * FROM public.session_exercises
               WHERE session_id = s.id ORDER BY order_index LOOP
      INSERT INTO public.session_exercises
        (session_id, exercise_id, order_index, sets, reps, notes, group_id, group_type,
         target_mode, rpe, load_mode, load_value, rest_sec, distance_km, duration_min,
         pace, hr_zone, tempo, prescription, template_generated_at, tags)
      VALUES
        (new_session_id, se.exercise_id, se.order_index, se.sets, se.reps, se.notes,
         se.group_id, se.group_type, se.target_mode, se.rpe, se.load_mode, se.load_value,
         se.rest_sec, se.distance_km, se.duration_min, se.pace, se.hr_zone, se.tempo,
         se.prescription, se.template_generated_at, COALESCE(se.tags, '{}'))
      RETURNING id INTO new_se_id;

      -- Each structured block is copied first, then its own rounds, so every
      -- round lands attached to the NEW block rather than pointing at the
      -- week it was copied from.
      FOR wb IN SELECT * FROM public.workout_blocks
                 WHERE session_exercise_id = se.id ORDER BY order_index LOOP
        INSERT INTO public.workout_blocks
          (session_exercise_id, block_type, order_index, label, target_mode, target_unit,
           distance_km, duration_min, pace, zone, pct_threshold, intensity_mode,
           rest_mode, rest_seconds, rest_ratio, notes, interval_count, double_peak)
        VALUES
          (new_se_id, wb.block_type, wb.order_index, wb.label, wb.target_mode, wb.target_unit,
           wb.distance_km, wb.duration_min, wb.pace, wb.zone, wb.pct_threshold,
           wb.intensity_mode, wb.rest_mode, wb.rest_seconds, wb.rest_ratio, wb.notes,
           wb.interval_count, wb.double_peak)
        RETURNING id INTO new_wb_id;

        INSERT INTO public.prescription_intervals
          (session_exercise_id, workout_block_id, order_index, label, target_value,
           target_unit, pace_per_km, hr_zone, watts, cadence, stroke, intensity,
           rest_seconds, rest_type, rest_mode, rest_ratio)
        SELECT new_se_id, new_wb_id, order_index, label, target_value,
               target_unit, pace_per_km, hr_zone, watts, cadence, stroke, intensity,
               rest_seconds, rest_type, rest_mode, rest_ratio
          FROM public.prescription_intervals
         WHERE workout_block_id = wb.id;
      END LOOP;

      -- Rounds belonging to no block: the original flat interval model, which
      -- most existing sessions still use.
      INSERT INTO public.prescription_intervals
        (session_exercise_id, order_index, label, target_value, target_unit,
         pace_per_km, hr_zone, watts, cadence, stroke, intensity,
         rest_seconds, rest_type, rest_mode, rest_ratio)
      SELECT new_se_id, order_index, label, target_value, target_unit,
             pace_per_km, hr_zone, watts, cadence, stroke, intensity,
             rest_seconds, rest_type, rest_mode, rest_ratio
        FROM public.prescription_intervals
       WHERE session_exercise_id = se.id AND workout_block_id IS NULL;
    END LOOP;
  END LOOP;
END $function$;
