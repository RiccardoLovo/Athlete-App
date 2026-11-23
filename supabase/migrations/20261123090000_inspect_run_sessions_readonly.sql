-- READ-ONLY. No INSERT/UPDATE/DELETE.
-- Why does a Run 2 session render as a flat interval table instead of as
-- structured blocks? Compare what each exercise actually carries.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT b.name AS block, s.week_number, s.day_of_week,
           e.name_en, e.structure_type, e.is_structured_container,
           (SELECT count(*) FROM public.workout_blocks wb
             WHERE wb.session_exercise_id = se.id) AS blocks,
           (SELECT count(*) FROM public.prescription_intervals pi
             WHERE pi.session_exercise_id = se.id) AS rounds,
           (SELECT count(*) FROM public.prescription_intervals pi
             WHERE pi.session_exercise_id = se.id
               AND pi.workout_block_id IS NOT NULL) AS rounds_in_blocks
      FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.exercises e ON e.id = se.exercise_id
     WHERE b.name IN ('Run', 'Run 2')
       AND b.plan_id = '1e938150-30dd-4064-bbfd-db58a45e279c'
       AND s.week_number = 1
     ORDER BY b.name, s.day_of_week, se.order_index
  LOOP
    RAISE NOTICE '% w% d% | % | type=% container=% | blocks=% rounds=% (in-block %)',
      rpad(r.block,6), r.week_number, r.day_of_week, rpad(r.name_en,32),
      rpad(COALESCE(r.structure_type,'-'),10), r.is_structured_container,
      r.blocks, r.rounds, r.rounds_in_blocks;
  END LOOP;

  RAISE NOTICE '--- totals across the whole plan ---';
  FOR r IN
    SELECT b.name AS block,
           count(*) FILTER (WHERE (SELECT count(*) FROM public.workout_blocks wb
                                    WHERE wb.session_exercise_id = se.id) > 0) AS with_blocks,
           count(*) FILTER (WHERE (SELECT count(*) FROM public.workout_blocks wb
                                    WHERE wb.session_exercise_id = se.id) = 0) AS without_blocks
      FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
     WHERE b.plan_id = '1e938150-30dd-4064-bbfd-db58a45e279c'
     GROUP BY b.name ORDER BY b.name
  LOOP
    RAISE NOTICE '% | exercises with blocks=% | without=%',
      rpad(r.block,8), r.with_blocks, r.without_blocks;
  END LOOP;
END $$;
