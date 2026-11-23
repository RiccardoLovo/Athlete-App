-- READ-ONLY. No INSERT/UPDATE/DELETE.
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '=== Plan 2 block dates (today is %) ===', current_date;
  FOR r IN
    WITH b AS (
      SELECT bl.id, bl.name, bl.position, bl.weeks, bl.archived, p.start_date,
             COALESCE(SUM(prev.weeks) FILTER (
               WHERE prev.position < bl.position AND NOT prev.archived), 0) AS before_weeks
        FROM public.training_blocks bl
        JOIN public.training_plans p ON p.id = bl.plan_id
        LEFT JOIN public.training_blocks prev ON prev.plan_id = bl.plan_id
       WHERE bl.plan_id = '1e938150-30dd-4064-bbfd-db58a45e279c'
       GROUP BY bl.id, bl.name, bl.position, bl.weeks, bl.archived, p.start_date
    ) SELECT * FROM b ORDER BY position
  LOOP
    RAISE NOTICE '% | %w | %', rpad(r.name,14), r.weeks,
      CASE WHEN r.archived THEN 'archived, no dates'
        ELSE (r.start_date + (r.before_weeks*7)::int)::text || ' -> ' ||
             (r.start_date + (r.before_weeks*7)::int + (r.weeks*7-1))::text
             || CASE WHEN current_date BETWEEN (r.start_date + (r.before_weeks*7)::int)
                       AND (r.start_date + (r.before_weeks*7)::int + (r.weeks*7-1))
                     THEN '   <== TODAY' ELSE '' END END;
  END LOOP;

  RAISE NOTICE '=== Run 2 structured coverage ===';
  FOR r IN
    SELECT e.name_en, s.week_number, s.day_of_week,
           (SELECT count(*) FROM public.workout_blocks wb
             WHERE wb.session_exercise_id = se.id) AS blocks,
           (SELECT count(*) FROM public.prescription_intervals pi
             WHERE pi.session_exercise_id = se.id) AS rounds,
           (SELECT count(*) FROM public.prescription_intervals pi
             WHERE pi.session_exercise_id = se.id AND pi.workout_block_id IS NULL) AS orphan
      FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.exercises e ON e.id = se.exercise_id
     WHERE b.plan_id = '1e938150-30dd-4064-bbfd-db58a45e279c' AND b.name = 'Run 2'
       AND EXISTS (SELECT 1 FROM public.prescription_intervals pi
                    WHERE pi.session_exercise_id = se.id)
     ORDER BY s.week_number, s.day_of_week
  LOOP
    RAISE NOTICE 'w% d% | % | blocks=% rounds=% orphaned=%',
      r.week_number, r.day_of_week, rpad(r.name_en,28), r.blocks, r.rounds, r.orphan;
  END LOOP;
END $$;
