-- Per-block logging. Until now an athlete recorded one total for a whole
-- structured session, so there was no record of what they actually did block
-- by block — and because the zone lives on the block, no way to know what
-- they actually spent in each zone. Prescribed time-in-zone was answerable;
-- actual was not.
--
-- The prescription stays untouched: this hangs off the athlete's log, the
-- same way the exercise swap does.

CREATE TABLE IF NOT EXISTS public.workout_block_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_log_id uuid NOT NULL
    REFERENCES public.exercise_logs(id) ON DELETE CASCADE,
  workout_block_id uuid NOT NULL
    REFERENCES public.workout_blocks(id) ON DELETE CASCADE,
  -- Stored canonically in km and minutes, like the block itself, so the UI
  -- can present whichever unit the block was prescribed in.
  distance_km numeric,
  duration_min numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_block_logs_unique UNIQUE (exercise_log_id, workout_block_id)
);

CREATE INDEX IF NOT EXISTS workout_block_logs_block_idx
  ON public.workout_block_logs (workout_block_id);

-- Ownership helpers, SECURITY DEFINER and flat. Writing these policies as
-- nested EXISTS over exercise_logs -> workout_logs -> clients is what made
-- workout_blocks take ~1.1s of query PLANNING before; the planner inlines
-- the whole chain per row.
CREATE OR REPLACE FUNCTION public.athlete_owns_exercise_log(_el_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.exercise_logs el
      JOIN public.workout_logs wl ON wl.id = el.workout_log_id
      JOIN public.clients c ON c.id = wl.client_id
     WHERE el.id = _el_id AND c.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.coach_owns_exercise_log(_el_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.exercise_logs el
      JOIN public.workout_logs wl ON wl.id = el.workout_log_id
     WHERE el.id = _el_id AND wl.coach_id = auth.uid()
  );
$$;

ALTER TABLE public.workout_block_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_block_logs_athlete ON public.workout_block_logs;
CREATE POLICY workout_block_logs_athlete ON public.workout_block_logs
  FOR ALL TO authenticated
  USING (public.athlete_owns_exercise_log(exercise_log_id))
  WITH CHECK (public.athlete_owns_exercise_log(exercise_log_id));

DROP POLICY IF EXISTS workout_block_logs_coach ON public.workout_block_logs;
CREATE POLICY workout_block_logs_coach ON public.workout_block_logs
  FOR ALL TO authenticated
  USING (public.coach_owns_exercise_log(exercise_log_id))
  WITH CHECK (public.coach_owns_exercise_log(exercise_log_id));

CREATE OR REPLACE FUNCTION public.touch_workout_block_log()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS workout_block_logs_touch ON public.workout_block_logs;
CREATE TRIGGER workout_block_logs_touch
  BEFORE UPDATE ON public.workout_block_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_workout_block_log();

-- Actual volume by zone, now answerable. Mirrors weekly_volume_by_zone,
-- which reports what was prescribed.
CREATE OR REPLACE FUNCTION public.weekly_actual_by_zone(
  _client_id uuid, _discipline text
)
RETURNS TABLE (
  block_id uuid, block_position int, week_number int, zone int,
  km numeric, minutes numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
SELECT s.block_id, b.position, s.week_number, wb.zone,
       ROUND(SUM(COALESCE(bl.distance_km, 0))::numeric, 2),
       ROUND(SUM(COALESCE(bl.duration_min, 0))::numeric, 0)
  FROM public.workout_block_logs bl
  JOIN public.workout_blocks wb ON wb.id = bl.workout_block_id
  JOIN public.exercise_logs el ON el.id = bl.exercise_log_id
  JOIN public.workout_logs wl ON wl.id = el.workout_log_id
  JOIN public.session_exercises se ON se.id = wb.session_exercise_id
  JOIN public.sessions s ON s.id = se.session_id
  JOIN public.training_blocks b ON b.id = s.block_id
  JOIN public.exercises e ON e.id = se.exercise_id
 WHERE wl.client_id = _client_id AND e.discipline = _discipline
 GROUP BY 1,2,3,4
 ORDER BY b.position, s.week_number, wb.zone NULLS LAST;
$$;
