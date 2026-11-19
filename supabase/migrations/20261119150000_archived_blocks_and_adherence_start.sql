-- Two things a plan could not express.
--
-- 1. A BLOCK KEPT BUT NOT SCHEDULED. A coach writes a block, the athlete
--    gets injured or the season turns, and the block is not going to
--    happen — but it is weeks of work and nobody wants to delete it. Until
--    now the only choices were "delete it" or "leave it in the calendar",
--    and leaving it in the calendar is not neutral: block dates are
--    derived by summing the weeks of every earlier block, so a parked
--    block silently pushes everything after it weeks into the future and
--    goes on generating sessions that count as missed.
--
--    An archived block keeps its sessions, its prescriptions and every log
--    against it, and contributes nothing to the date chain. It has no
--    dates at all, which is the honest answer for work with no date.
--
-- 2. A LINE UNDER THE PAST. Adherence is derived from the calendar, which
--    is what makes it trustworthy — but it also means restructuring a plan
--    retroactively re-judges months of training that were never going to
--    be done. An athlete coming back from injury does not need the app to
--    open on forty missed sessions.
--
--    adherence_from is that line. Sessions planned before it are never
--    counted as missed. Deliberately only affects *counting*: the sessions
--    stay, the logs stay, every weight and threshold recorded against them
--    stays and still counts for history and progression. Nothing is
--    deleted and nothing is marked done that was not done.

-- ----------------------------------------------------------- archived blocks
ALTER TABLE public.training_blocks
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.training_blocks.archived IS
  'Kept for reference, out of the calendar: contributes no weeks to the '
  'date chain and generates no scheduled sessions. Its own sessions and '
  'logs are retained.';

-- --------------------------------------------------------- adherence floor
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS adherence_from date;

COMMENT ON COLUMN public.clients.adherence_from IS
  'Sessions planned before this date are never counted as missed. Used '
  'when a plan is restructured or an athlete restarts, so the past is not '
  're-judged. Does not hide or alter any session, log or recorded weight.';

-- ------------------------------------------------------------ volume by week
-- weekly_volume derives week_start the same way the app does, by summing
-- the weeks of earlier blocks, so it has to skip archived blocks too or
-- every week after one would be dated wrong. Archived blocks are also left
-- out of the figures entirely: work with no date cannot sit in a weekly
-- table, and reporting it as planned volume for a week it was never
-- scheduled in would be worse than omitting it.
DROP FUNCTION IF EXISTS public.weekly_volume(uuid);

CREATE FUNCTION public.weekly_volume(_client_id uuid)
RETURNS TABLE (
  plan_id uuid, plan_name text, block_id uuid, block_name text,
  block_position int, week_number int, week_start date, discipline text,
  planned_km numeric, planned_km_estimated numeric, planned_minutes numeric,
  actual_km numeric, actual_minutes numeric,
  sessions_total int, sessions_unmeasured int,
  extra_km numeric, extra_minutes numeric, extra_sessions int
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH scope AS (
  SELECT b.id AS block_id, b.name AS block_name, b.position AS block_position,
         p.id AS plan_id, p.name AS plan_name, p.start_date,
         COALESCE(SUM(prev.weeks) FILTER (
           WHERE prev.position < b.position AND NOT prev.archived
         ), 0) AS weeks_before
    FROM public.training_blocks b
    JOIN public.training_plans p ON p.id = b.plan_id
    LEFT JOIN public.training_blocks prev ON prev.plan_id = b.plan_id
   WHERE p.athlete_id = _client_id
     AND NOT b.archived
   GROUP BY b.id, b.name, b.position, p.id, p.name, p.start_date
),
all_se AS (
  SELECT se.id, s.block_id, s.week_number, e.discipline
    FROM public.session_exercises se
    JOIN public.sessions s ON s.id = se.session_id
    JOIN public.exercises e ON e.id = se.exercise_id
   WHERE e.discipline IN ('Running','Swimming','Cycling')
     AND s.block_id IN (SELECT block_id FROM scope)
),
planned AS (
  SELECT block_id, week_number, discipline,
         SUM(km_direct) AS km, SUM(km_estimated) AS km_est, SUM(minutes) AS minutes
    FROM public.v_planned_volume
   WHERE block_id IN (SELECT block_id FROM scope)
   GROUP BY 1,2,3
),
actual AS (
  SELECT s.block_id, s.week_number, e.discipline,
         SUM(COALESCE(l.distance_km,0)) AS km,
         SUM(COALESCE(l.duration_min,0)) AS minutes
    FROM public.exercise_logs l
    JOIN public.workout_logs wl ON wl.id = l.workout_log_id
    JOIN public.session_exercises se ON se.id = l.session_exercise_id
    JOIN public.sessions s ON s.id = se.session_id
    JOIN public.exercises e ON e.id = se.exercise_id
   WHERE wl.client_id = _client_id
     AND e.discipline IN ('Running','Swimming','Cycling')
     AND s.block_id IN (SELECT block_id FROM scope)
   GROUP BY 1,2,3
),
extra AS (
  SELECT s.block_id, s.week_number, s.discipline,
         SUM(COALESCE(s.distance_meters,0)) / 1000.0 AS km,
         SUM(COALESCE(s.duration_minutes,0)) AS minutes,
         COUNT(*)::int AS sessions
    FROM public.sessions s
   WHERE s.is_client_added
     AND s.discipline IN ('Running','Swimming','Cycling')
     AND s.block_id IN (SELECT block_id FROM scope)
   GROUP BY 1,2,3
),
counts AS (
  SELECT a.block_id, a.week_number, a.discipline,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE NOT EXISTS (SELECT 1 FROM public.v_planned_volume v
                              WHERE v.session_exercise_id = a.id)
         )::int AS unmeasured
    FROM all_se a GROUP BY 1,2,3
),
keys AS (
  SELECT block_id, week_number, discipline FROM counts
  UNION
  SELECT block_id, week_number, discipline FROM extra
)
SELECT sc.plan_id, sc.plan_name, sc.block_id, sc.block_name, sc.block_position,
       k.week_number,
       (sc.start_date + ((sc.weeks_before + k.week_number - 1) * 7)::int)::date,
       k.discipline,
       ROUND(COALESCE(pl.km,0)::numeric, 2),
       ROUND(COALESCE(pl.km_est,0)::numeric, 2),
       ROUND(COALESCE(pl.minutes,0)::numeric, 0),
       ROUND(COALESCE(ac.km,0)::numeric, 2),
       ROUND(COALESCE(ac.minutes,0)::numeric, 0),
       COALESCE(c.total, 0), COALESCE(c.unmeasured, 0),
       ROUND(COALESCE(ex.km,0)::numeric, 2),
       ROUND(COALESCE(ex.minutes,0)::numeric, 0),
       COALESCE(ex.sessions, 0)
  FROM keys k
  JOIN scope sc ON sc.block_id = k.block_id
  LEFT JOIN counts c ON c.block_id = k.block_id
                    AND c.week_number = k.week_number
                    AND c.discipline = k.discipline
  LEFT JOIN planned pl ON pl.block_id = k.block_id
                      AND pl.week_number = k.week_number
                      AND pl.discipline = k.discipline
  LEFT JOIN actual ac ON ac.block_id = k.block_id
                     AND ac.week_number = k.week_number
                     AND ac.discipline = k.discipline
  LEFT JOIN extra ex ON ex.block_id = k.block_id
                    AND ex.week_number = k.week_number
                    AND ex.discipline = k.discipline
 ORDER BY sc.block_position, k.week_number, k.discipline;
$$;

-- ------------------------------------------------------------- copy a block
-- Duplicating a block was only possible one week at a time, through
-- copy_week. Repeating a block the athlete is going to redo is the normal
-- case after an interruption, and doing it by hand across six weeks is how
-- a week gets missed.
--
-- Copies structure only. No workout_logs and no exercise_logs come across,
-- which is the point: the athlete is asked to log the work again as they
-- do it, and the original block keeps its own history intact.
CREATE OR REPLACE FUNCTION public.copy_block(
  _source_block_id uuid, _target_plan_id uuid, _name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  src record;
  new_block_id uuid;
  next_position int;
  w int;
BEGIN
  SELECT b.* INTO src
    FROM public.training_blocks b
    JOIN public.training_plans p ON p.id = b.plan_id
   WHERE b.id = _source_block_id AND p.coach_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Source block not found or not yours'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.training_plans p
     WHERE p.id = _target_plan_id AND p.coach_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Target plan not found or not yours'; END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO next_position
    FROM public.training_blocks WHERE plan_id = _target_plan_id;

  INSERT INTO public.training_blocks (plan_id, name, position, weeks)
  VALUES (_target_plan_id, COALESCE(_name, src.name), next_position, src.weeks)
  RETURNING id INTO new_block_id;

  -- copy_week already carries sessions, exercises, structured blocks and
  -- their rounds, and is the one place that knows how. Reusing it means
  -- this cannot drift from it the way it drifted from its own callers.
  FOR w IN 1..src.weeks LOOP
    PERFORM public.copy_week(_source_block_id, w, new_block_id, w);
  END LOOP;

  RETURN new_block_id;
END $$;

COMMENT ON FUNCTION public.copy_block(uuid, uuid, text) IS
  'Duplicate a block into a plan, structure only — no logs. Returns the new block id.';
