-- Give Run 2's interval work a structured block, so it renders the new way.
--
-- The whole plan was written before workout_blocks existed: 309 of its 310
-- exercises carry none, which is why a Fartlek shows as a flat
-- "# / Prescribed / Actual" table instead of the block sentences, the
-- session profile and the heart-rate bands. The new rendering is not
-- broken for these sessions; it has no data to read.
--
-- Converting Run 2 only, by request, and Run 2 is the right one to
-- convert: it is a fresh copy with ZERO logs, so changing how its work is
-- recorded cannot orphan an actual the athlete already entered. The
-- original Run block keeps its 5 logs and its old shape untouched.
--
-- LOSSLESS. Nothing is invented and no round is rewritten. Each interval
-- exercise gains one parent block of type 'intervals' and its existing
-- prescription_intervals rows are pointed at it. Targets, paces, zones,
-- intensities and rests are exactly the values that were already there —
-- including the ones that look wrong, which are a separate question.

DO $$
DECLARE
  v_plan2 uuid := '1e938150-30dd-4064-bbfd-db58a45e279c';
  r record; v_block uuid; v_made int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.training_blocks
                  WHERE plan_id = v_plan2 AND name = 'Run 2') THEN
    RAISE NOTICE 'Run 2 not present — skipping, changing nothing.';
    RETURN;
  END IF;

  FOR r IN
    SELECT se.id AS se_id, e.name_en, s.week_number, s.day_of_week,
           count(pi.id) AS rounds
      FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.exercises e ON e.id = se.exercise_id
      JOIN public.prescription_intervals pi ON pi.session_exercise_id = se.id
     WHERE b.plan_id = v_plan2 AND b.name = 'Run 2'
       AND pi.workout_block_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.workout_blocks wb
                        WHERE wb.session_exercise_id = se.id)
     GROUP BY se.id, e.name_en, s.week_number, s.day_of_week
     ORDER BY s.week_number, s.day_of_week
  LOOP
    INSERT INTO public.workout_blocks
      (session_exercise_id, block_type, order_index, label)
    VALUES (r.se_id, 'intervals', 0, r.name_en)
    RETURNING id INTO v_block;

    UPDATE public.prescription_intervals
       SET workout_block_id = v_block
     WHERE session_exercise_id = r.se_id
       AND workout_block_id IS NULL;

    v_made := v_made + 1;
    RAISE NOTICE 'w% d% | % | % rounds -> block %',
      r.week_number, r.day_of_week, rpad(r.name_en,28), r.rounds, v_block;
  END LOOP;

  RAISE NOTICE 'Converted % exercises in Run 2.', v_made;
END $$;
