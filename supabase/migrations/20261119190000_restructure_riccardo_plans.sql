-- Riccardo's restart after injury. A one-off data change, by request.
--
-- Before: one plan, "Plan 1", holding seven blocks — Bike, Swim, Run,
-- Bike, Swim, Run, TEST — the athlete 24 weeks into a 28-week chain with
-- 94 unlogged past sessions counted against him.
--
-- After:
--   Plan 1 (completed)  Bike, Swim, Run, and TEST archived.
--   Plan 2 (active)     Bike, Run, Run (repeat), and Swim archived.
--
-- WHY THE DATES MOVE. Block dates are derived: plan start plus the weeks
-- of every earlier block. The repeat must begin Monday 2026-11-23 and two
-- 4-week blocks precede it, so Plan 2 starts 56 days earlier, 2026-09-28.
-- Bike then reads 28 Sep – 25 Oct and Run 26 Oct – 22 Nov instead of the
-- dates they held inside the old 28-week chain. Logs keep the real dates
-- they were performed; the planned dates move, and adherence_from means
-- none of it is judged.
--
-- WHY PLAN 2 IS BORN IN 2027 AND THEN MOVED. A trigger forbids two plans
-- of one athlete overlapping in time. Plan 1 only stops overlapping once
-- its last three blocks have moved out, and they cannot move before the
-- plan they are moving to exists. So Plan 2 is created clear of
-- everything, filled, and only then dated.
--
-- NOTHING IS DELETED. Blocks move with every session and log attached.
-- Swim and TEST are archived, not removed.
--
-- REVERSAL:
--   UPDATE training_blocks SET plan_id='2fa0f27f-e7a5-4dde-9587-ae981615b5b3', position=4, archived=false WHERE id='6853c790-a6e5-416b-96a2-6fd4ef36e64b';
--   UPDATE training_blocks SET plan_id='2fa0f27f-e7a5-4dde-9587-ae981615b5b3', position=5, archived=false WHERE id='17aa36db-b936-4ada-a380-c8a2e58e9a66';
--   UPDATE training_blocks SET plan_id='2fa0f27f-e7a5-4dde-9587-ae981615b5b3', position=6, archived=false WHERE id='fc007dfc-ee1a-4ef8-9da0-d78eccffd100';
--   UPDATE training_blocks SET archived=false WHERE id='a0513fb9-a83a-4f23-89cb-16ac140fa302';
--   DELETE FROM training_plans WHERE athlete_id='e19a5b39-fd53-4c1e-bace-cd9cacbcb01c' AND name='Plan 2';  -- cascades the repeat block
--   UPDATE training_plans SET status='active' WHERE id='2fa0f27f-e7a5-4dde-9587-ae981615b5b3';
--   UPDATE clients SET adherence_from=NULL WHERE id='e19a5b39-fd53-4c1e-bace-cd9cacbcb01c';

DO $$
DECLARE
  v_client  uuid := 'e19a5b39-fd53-4c1e-bace-cd9cacbcb01c'; -- Riccardo Lovo
  v_plan1   uuid := '2fa0f27f-e7a5-4dde-9587-ae981615b5b3'; -- "Plan 1"
  v_bike2   uuid := '6853c790-a6e5-416b-96a2-6fd4ef36e64b'; -- pos 4, Bike
  v_swim2   uuid := '17aa36db-b936-4ada-a380-c8a2e58e9a66'; -- pos 5, Swim
  v_run2    uuid := 'fc007dfc-ee1a-4ef8-9da0-d78eccffd100'; -- pos 6, Run
  v_test    uuid := 'a0513fb9-a83a-4f23-89cb-16ac140fa302'; -- pos 7, TEST
  v_monday  date := date '2026-11-23';
  v_park    date := date '2028-01-03';   -- clear of every existing plan
  v_coach uuid; v_plan2 uuid; v_repeat uuid; v_start date;
BEGIN
  -- This is a one-off keyed to specific rows on the live database. On any
  -- other database — a rebuild from scratch, a fresh branch — those rows
  -- do not exist, and a hard failure here would abort the whole migration
  -- chain for a change that is none of its business. So it skips.
  IF NOT EXISTS (SELECT 1 FROM public.training_plans WHERE id = v_plan1) THEN
    RAISE NOTICE 'Plan 1 not present — skipping this one-off restructure.';
    RETURN;
  END IF;
  IF (SELECT count(*) FROM public.training_blocks
       WHERE id IN (v_bike2, v_swim2, v_run2, v_test) AND plan_id = v_plan1) <> 4 THEN
    RAISE NOTICE 'Blocks 4-7 are not all in Plan 1 — skipping, changing nothing.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.training_plans
              WHERE athlete_id = v_client AND name = 'Plan 2') THEN
    RAISE NOTICE 'Plan 2 already exists — nothing to do.';
    RETURN;
  END IF;

  SELECT coach_id INTO v_coach FROM public.training_plans WHERE id = v_plan1;
  v_start := v_monday - 56;

  INSERT INTO public.training_plans (coach_id, athlete_id, name, start_date, status)
  VALUES (v_coach, v_client, 'Plan 2', v_park, 'draft')
  RETURNING id INTO v_plan2;

  UPDATE public.training_blocks SET plan_id = v_plan2, position = 1 WHERE id = v_bike2;
  UPDATE public.training_blocks SET plan_id = v_plan2, position = 2 WHERE id = v_run2;
  UPDATE public.training_blocks
     SET plan_id = v_plan2, position = 4, archived = true WHERE id = v_swim2;

  -- copy_block carries structure only — no workout_logs, no exercise_logs
  -- — so the repeat arrives unlogged and Riccardo is asked to record it
  -- again as he trains it, while the original keeps its history. It and
  -- copy_week both check auth.uid(), null inside a migration, so the
  -- coach's identity is set for this transaction only.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_coach::text)::text, true);
  v_repeat := public.copy_block(v_run2, v_plan2, 'Run (repeat)');
  PERFORM set_config('request.jwt.claims', NULL, true);
  UPDATE public.training_blocks SET position = 3 WHERE id = v_repeat;

  UPDATE public.training_blocks SET archived = true WHERE id = v_test;

  -- Plan 1 is now 12 scheduled weeks (1 Jun – 23 Aug), so Plan 2 can take
  -- its real dates without overlapping it.
  UPDATE public.training_plans SET start_date = v_start WHERE id = v_plan2;

  UPDATE public.training_plans SET status = 'completed' WHERE id = v_plan1;
  UPDATE public.training_plans SET status = 'active'    WHERE id = v_plan2;

  UPDATE public.clients SET adherence_from = v_monday WHERE id = v_client;

  RAISE NOTICE 'Plan 2 % | start % | repeat block % starts %',
    v_plan2, v_start, v_repeat, v_monday;
END $$;
