-- READ-ONLY. No INSERT/UPDATE/DELETE.
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '=== structured container exercises (what the builder offers) ===';
  FOR r IN
    SELECT name_en, discipline, structure_type
      FROM public.exercises
     WHERE is_structured_container
     ORDER BY discipline, name_en
  LOOP
    RAISE NOTICE '% | % | %', rpad(r.name_en,28), rpad(r.discipline,10), r.structure_type;
  END LOOP;

  RAISE NOTICE '=== Run 2: what is in each session today ===';
  FOR r IN
    SELECT s.week_number, s.day_of_week,
           string_agg(e.name_en || CASE WHEN e.is_structured_container
                                        THEN ' [container]' ELSE '' END,
                      ', ' ORDER BY se.order_index) AS exercises
      FROM public.sessions s
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.session_exercises se ON se.session_id = s.id
      JOIN public.exercises e ON e.id = se.exercise_id
     WHERE b.plan_id = '1e938150-30dd-4064-bbfd-db58a45e279c' AND b.name = 'Run 2'
       AND s.week_number = 1
     GROUP BY s.week_number, s.day_of_week ORDER BY s.day_of_week
  LOOP
    RAISE NOTICE 'w% d% | %', r.week_number, r.day_of_week, r.exercises;
  END LOOP;
END $$;
