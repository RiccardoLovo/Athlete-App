-- Weekly training volume by discipline, and by zone within a discipline.
--
-- Volume is assembled from the three places it is actually prescribed, in
-- order of precision: interval rounds, structured workout blocks, then the
-- flat fields on the session exercise. Free-text notes are NOT parsed — most
-- endurance prescription currently lives there, so every query also reports
-- how many session exercises carried no machine-readable volume at all. A
-- small number with "9 not captured" beside it is informative; the same number
-- presented alone is a lie.
--
-- Time is converted to distance ONLY where a pace is actually prescribed.
-- Nothing is estimated from an assumed speed.

-- "4:30" / "4:30.5" / "90" -> seconds. Null on anything else.
CREATE OR REPLACE FUNCTION public.parse_pace_seconds(_pace text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _pace IS NULL OR btrim(_pace) = '' THEN NULL
    WHEN _pace ~ '^\s*\d+:\d{1,2}(\.\d+)?\s*$' THEN
      split_part(btrim(_pace), ':', 1)::numeric * 60
      + split_part(btrim(_pace), ':', 2)::numeric
    WHEN _pace ~ '^\s*\d+(\.\d+)?\s*$' THEN btrim(_pace)::numeric
    ELSE NULL
  END;
$$;

-- hr_zone, or an intensity written as "Z4" / "z4".
CREATE OR REPLACE FUNCTION public.zone_of(_hr_zone int, _intensity text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    _hr_zone,
    CASE WHEN _intensity ~* '^\s*z\s*([1-5])' THEN
      (regexp_match(_intensity, '^\s*[zZ]\s*([1-5])'))[1]::int END
  );
$$;

-- One row per unit of prescribed work, already reduced to km and minutes.
-- Swim paces are per 100 m, run and bike paces per km — the same column means
-- different things by discipline, which is why the conversion happens here
-- rather than in three places in the UI.
CREATE OR REPLACE VIEW public.v_planned_volume AS
WITH units AS (
  -- interval rounds
  SELECT se.id AS session_exercise_id, s.block_id, s.week_number,
         e.discipline,
         public.zone_of(pi.hr_zone, pi.intensity) AS zone,
         CASE WHEN pi.target_unit = 'meters' THEN pi.target_value / 1000.0 END AS km,
         CASE WHEN pi.target_unit = 'seconds' THEN pi.target_value / 60.0
              WHEN pi.target_unit = 'minutes' THEN pi.target_value END AS minutes,
         public.parse_pace_seconds(pi.pace_per_km) AS pace_sec
    FROM public.prescription_intervals pi
    JOIN public.session_exercises se ON se.id = pi.session_exercise_id
    JOIN public.sessions s ON s.id = se.session_id
    JOIN public.exercises e ON e.id = se.exercise_id
   WHERE e.discipline IN ('Running','Swimming','Cycling')

  UNION ALL
  -- structured workout blocks
  SELECT se.id, s.block_id, s.week_number, e.discipline,
         wb.zone,
         wb.distance_km,
         wb.duration_min,
         public.parse_pace_seconds(wb.pace)
    FROM public.workout_blocks wb
    JOIN public.session_exercises se ON se.id = wb.session_exercise_id
    JOIN public.sessions s ON s.id = se.session_id
    JOIN public.exercises e ON e.id = se.exercise_id
   WHERE e.discipline IN ('Running','Swimming','Cycling')
     AND (wb.distance_km IS NOT NULL OR wb.duration_min IS NOT NULL)

  UNION ALL
  -- flat fields on the session exercise, only when it has no finer detail
  SELECT se.id, s.block_id, s.week_number, e.discipline,
         se.hr_zone, se.distance_km, se.duration_min,
         public.parse_pace_seconds(se.pace)
    FROM public.session_exercises se
    JOIN public.sessions s ON s.id = se.session_id
    JOIN public.exercises e ON e.id = se.exercise_id
   WHERE e.discipline IN ('Running','Swimming','Cycling')
     AND (se.distance_km IS NOT NULL OR se.duration_min IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.prescription_intervals pi
                      WHERE pi.session_exercise_id = se.id)
     AND NOT EXISTS (SELECT 1 FROM public.workout_blocks wb
                      WHERE wb.session_exercise_id = se.id)
)
SELECT session_exercise_id, block_id, week_number, discipline, zone,
       COALESCE(km, 0) AS km_direct,
       COALESCE(minutes, 0) AS minutes,
       -- Distance implied by a prescribed pace, kept separate so the UI can
       -- label it as an estimate rather than a measurement.
       CASE
         WHEN km IS NOT NULL OR minutes IS NULL OR pace_sec IS NULL OR pace_sec <= 0 THEN 0
         WHEN discipline = 'Swimming' THEN (minutes * 60.0 / pace_sec) * 100 / 1000.0
         ELSE minutes * 60.0 / pace_sec
       END AS km_estimated
  FROM units;

-- Weekly totals per discipline for one athlete, planned beside actual.
CREATE OR REPLACE FUNCTION public.weekly_volume(_client_id uuid)
RETURNS TABLE (
  plan_id uuid, plan_name text, block_id uuid, block_name text,
  block_position int, week_number int, week_start date, discipline text,
  planned_km numeric, planned_km_estimated numeric, planned_minutes numeric,
  actual_km numeric, actual_minutes numeric,
  sessions_total int, sessions_unmeasured int
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
planned AS (
  SELECT block_id, week_number, discipline,
         SUM(km_direct) AS km, SUM(km_estimated) AS km_est, SUM(minutes) AS minutes,
         array_agg(DISTINCT session_exercise_id) AS measured_ids
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
counts AS (
  SELECT a.block_id, a.week_number, a.discipline,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE NOT EXISTS (SELECT 1 FROM public.v_planned_volume v
                              WHERE v.session_exercise_id = a.id)
         )::int AS unmeasured
    FROM all_se a GROUP BY 1,2,3
)
SELECT sc.plan_id, sc.plan_name, sc.block_id, sc.block_name, sc.block_position,
       c.week_number,
       (sc.start_date + ((sc.weeks_before + c.week_number - 1) * 7)::int)::date,
       c.discipline,
       ROUND(COALESCE(pl.km,0)::numeric, 2),
       ROUND(COALESCE(pl.km_est,0)::numeric, 2),
       ROUND(COALESCE(pl.minutes,0)::numeric, 0),
       ROUND(COALESCE(ac.km,0)::numeric, 2),
       ROUND(COALESCE(ac.minutes,0)::numeric, 0),
       c.total, c.unmeasured
  FROM counts c
  JOIN scope sc ON sc.block_id = c.block_id
  LEFT JOIN planned pl ON pl.block_id = c.block_id
                      AND pl.week_number = c.week_number
                      AND pl.discipline = c.discipline
  LEFT JOIN actual ac ON ac.block_id = c.block_id
                     AND ac.week_number = c.week_number
                     AND ac.discipline = c.discipline
 ORDER BY sc.block_position, c.week_number, c.discipline;
$$;

-- Zone breakdown inside one discipline. Work with no zone set is reported
-- under zone NULL rather than dropped, so the totals still reconcile.
CREATE OR REPLACE FUNCTION public.weekly_volume_by_zone(
  _client_id uuid, _discipline text
)
RETURNS TABLE (
  block_id uuid, block_position int, week_number int, zone int,
  km numeric, km_estimated numeric, minutes numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
SELECT v.block_id, b.position, v.week_number, v.zone,
       ROUND(SUM(v.km_direct)::numeric, 2),
       ROUND(SUM(v.km_estimated)::numeric, 2),
       ROUND(SUM(v.minutes)::numeric, 0)
  FROM public.v_planned_volume v
  JOIN public.training_blocks b ON b.id = v.block_id
  JOIN public.training_plans p ON p.id = b.plan_id
 WHERE p.athlete_id = _client_id AND v.discipline = _discipline
 GROUP BY 1,2,3,4
 ORDER BY b.position, v.week_number, v.zone NULLS LAST;
$$;
