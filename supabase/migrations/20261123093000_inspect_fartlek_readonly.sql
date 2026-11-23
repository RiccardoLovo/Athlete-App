-- READ-ONLY. No INSERT/UPDATE/DELETE.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT b.name AS block, pi.order_index, pi.label, pi.target_value,
           pi.target_unit, pi.pace_per_km, pi.hr_zone, pi.intensity,
           pi.rest_seconds, pi.rest_mode, pi.rest_type
      FROM public.prescription_intervals pi
      JOIN public.session_exercises se ON se.id = pi.session_exercise_id
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.exercises e ON e.id = se.exercise_id
     WHERE b.plan_id = '1e938150-30dd-4064-bbfd-db58a45e279c'
       AND b.name = 'Run 2' AND s.week_number = 1 AND s.day_of_week = 5
       AND e.name_en = 'Pace Variations (Fartlek)'
     ORDER BY pi.order_index
  LOOP
    RAISE NOTICE '#% | label=% | target=% % | pace=% | HR Z% | % | rest % (% / %)',
      r.order_index, COALESCE(r.label,'-'), r.target_value, r.target_unit,
      COALESCE(r.pace_per_km,'-'), COALESCE(r.hr_zone::text,'-'),
      COALESCE(r.intensity,'-'), COALESCE(r.rest_seconds::text,'-'),
      COALESCE(r.rest_mode,'-'), COALESCE(r.rest_type,'-');
  END LOOP;
END $$;
