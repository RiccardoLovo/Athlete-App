-- Work the athlete did on their own, as its own column.
--
-- weekly_volume derives every number from session_exercises joined to
-- exercises. A session the athlete logged themselves has no exercises at
-- all: it carries its discipline, duration_minutes and distance_meters on
-- the sessions row, which is how Log Extra Session writes it. So that work
-- has been invisible in the volume analytics since the feature shipped —
-- not under-counted, absent. A week where the athlete swapped the
-- prescribed run for their own 15k read as a missed run and nothing else.
--
-- A THIRD COLUMN, not added to actual. Folding it into the actual figures
-- would make that week look like the plan was delivered and then some,
-- when what happened is the athlete trained something else. Planned,
-- done-as-planned and done-instead are three different facts and the
-- coach needs all three to say anything useful.
--
-- The row keys are now a union rather than taken from the prescribed
-- sessions alone: an extra swim in a week with no swim prescribed has no
-- counts row to attach to, and would otherwise vanish for the second time.

-- The return type gains three columns, and CREATE OR REPLACE cannot change
-- a function's signature, so the old one goes first.
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
         COALESCE(SUM(prev.weeks) FILTER (WHERE prev.position < b.position), 0) AS weeks_before
    FROM public.training_blocks b
    JOIN public.training_plans p ON p.id = b.plan_id
    LEFT JOIN public.training_blocks prev ON prev.plan_id = b.plan_id
   WHERE p.athlete_id = _client_id
   GROUP BY b.id, b.name, b.position, p.id, p.name, p.start_date
),
-- Every endurance session exercise in scope, so "not captured" can be counted.
all_se AS (
  SELECT se.id, s.block_id, s.week_number, e.discipline
    FROM public.session_exercises se
    JOIN public.sessions s ON s.id = se.session_id
    JOIN public.exercises e ON e.id = se.exercise_id
   WHERE e.discipline IN ('Running','Swimming','Cycling')
     AND s.block_id IN (SELECT block_id FROM scope)
),
-- measured_ids used to be aggregated here and was never selected; the
-- unmeasured count is a NOT EXISTS below. Dropped rather than carried.
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
   GROUP BY 1,2,3
),
-- Sessions the athlete added. They never reach all_se, so they cannot be
-- double-counted against actual: that CTE needs exercise_logs rows, and
-- these sessions have no exercises to log against.
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
-- Prescribed work and the athlete's own both open a row.
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
