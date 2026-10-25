-- Structured workout refinements:
--  * target unit is now explicit (km/m for distance, min/sec for time)
--    instead of being inferred from target_mode + discipline;
--  * intensity_mode records whether the Zone or the Pace is the binding
--    target, so the other can be shown as merely indicative;
--  * rest can be expressed as seconds OR as a work:rest ratio (1:1), both
--    on blocks and on individual interval rounds.

ALTER TABLE public.workout_blocks
  ADD COLUMN target_unit text CHECK (target_unit IN ('km', 'm', 'min', 'sec')),
  ADD COLUMN intensity_mode text NOT NULL DEFAULT 'zone'
    CHECK (intensity_mode IN ('zone', 'pace')),
  ADD COLUMN rest_mode text NOT NULL DEFAULT 'seconds'
    CHECK (rest_mode IN ('seconds', 'ratio')),
  ADD COLUMN rest_seconds numeric,
  ADD COLUMN rest_ratio numeric;

-- Backfill units for rows created before the column existed. Swim blocks
-- are authored in metres; everything else in km.
UPDATE public.workout_blocks wb
SET target_unit = CASE
  WHEN wb.target_mode = 'time' THEN 'min'
  WHEN e.discipline = 'Swimming' THEN 'm'
  ELSE 'km'
END
FROM public.session_exercises se
  JOIN public.exercises e ON e.id = se.exercise_id
WHERE se.id = wb.session_exercise_id AND wb.target_unit IS NULL;

ALTER TABLE public.prescription_intervals
  ADD COLUMN rest_mode text NOT NULL DEFAULT 'seconds'
    CHECK (rest_mode IN ('seconds', 'ratio')),
  ADD COLUMN rest_ratio numeric;
