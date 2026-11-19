-- The coach can say how hard a session should feel.
--
-- The athlete already reports effort after every session (workout_logs.
-- borg_scale, 1-10) and the coach had no way to say what they were aiming
-- for. That makes the single most useful number in the whole feedback
-- loop unreadable: a reported 8 is excellent news on a threshold session
-- and a reason to phone the athlete on a recovery run, and nothing in the
-- app knew which one it was looking at.
--
-- Deliberately on the session rather than the block. The athlete reports
-- one effort for the whole session, so a per-block target would have no
-- counterpart to be compared against — and a prescription that cannot be
-- compared with what happened is decoration.
--
-- Nullable, with no default. A coach who has not said is different from a
-- coach who said "moderate", and defaulting to the middle of the scale
-- would invent an instruction nobody gave.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS target_borg smallint;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_target_borg_chk;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_target_borg_chk
  CHECK (target_borg IS NULL OR target_borg BETWEEN 1 AND 10);

COMMENT ON COLUMN public.sessions.target_borg IS
  'How hard this session should feel, 1-10, on the same scale the athlete '
  'reports in workout_logs.borg_scale. NULL means the coach did not say.';

-- copy_week has to carry the two columns added since it was last touched,
-- or Copy Week quietly drops them.
--
-- This is the second time: the function's own header (20261110090000)
-- records it having fallen behind three earlier migrations, which turned
-- Copy Week into a trap that ate every structured block. A coach copying
-- a week forward would otherwise lose which session comes first on a
-- two-a-day, and the effort target for every session in the week.
--
-- The rest of the body is unchanged from 20261110090000.

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
            WHERE block_id = _source_block_id AND week_number = _source_week
            ORDER BY day_of_week, day_order, created_at LOOP
    INSERT INTO public.sessions
      (block_id, week_number, day_of_week, day_order, name, notes, status,
       is_optional, target_borg, training_category_tags, body_region)
    VALUES
      (_target_block_id, _target_week, s.day_of_week, s.day_order, s.name, s.notes,
       COALESCE(s.status,'planned'), s.is_optional, s.target_borg,
       s.training_category_tags, s.body_region)
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
