-- "I am not on a plan this week."
--
-- Block dates are a continuous chain: plan start plus the weeks of every
-- earlier block, with no way to express a week where nothing is
-- prescribed. So an athlete who stopped mid-block reads as still being in
-- it — Riccardo shows as week 4 of a running block he stopped three weeks
-- ago, because the arithmetic has nowhere else to put today.
--
-- A one-week block with no sessions is the gap. It costs no new concept:
-- blocks already carry weeks and already render with no sessions, and the
-- week feed already says when a week holds nothing. It is also the true
-- record — the week was not training, and now the plan says so.
--
-- The chain then reads:
--   Bike          4w  21 Sep – 18 Oct
--   Run           4w  19 Oct – 15 Nov   (stopped partway, logs kept)
--   Off — injury  1w  16 Nov – 22 Nov   <- today
--   Run 2         4w  23 Nov – 20 Dec   <- the restart
--   Swim              archived, no dates
--
-- Plan 2 moves back a week to 2026-09-21 so the restart still lands on
-- Monday the 23rd with the off week in front of it.
--
-- REVERSAL:
--   DELETE FROM training_blocks WHERE plan_id='1e938150-30dd-4064-bbfd-db58a45e279c' AND name='Off — injury';
--   UPDATE training_blocks SET position=3 WHERE plan_id='1e938150-30dd-4064-bbfd-db58a45e279c' AND name='Run 2';
--   UPDATE training_blocks SET position=4 WHERE plan_id='1e938150-30dd-4064-bbfd-db58a45e279c' AND name='Swim';
--   UPDATE training_plans SET start_date='2026-09-28' WHERE id='1e938150-30dd-4064-bbfd-db58a45e279c';

DO $$
DECLARE
  v_plan2 uuid := '1e938150-30dd-4064-bbfd-db58a45e279c';
  v_run2  uuid;
  v_swim  uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.training_plans WHERE id = v_plan2) THEN
    RAISE NOTICE 'Plan 2 not present — skipping, changing nothing.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.training_blocks
              WHERE plan_id = v_plan2 AND name = 'Off — injury') THEN
    RAISE NOTICE 'Off week already present — nothing to do.';
    RETURN;
  END IF;

  SELECT id INTO v_run2 FROM public.training_blocks
   WHERE plan_id = v_plan2 AND name = 'Run 2';
  SELECT id INTO v_swim FROM public.training_blocks
   WHERE plan_id = v_plan2 AND name = 'Swim';
  IF v_run2 IS NULL THEN
    RAISE NOTICE 'Run 2 not found — skipping, changing nothing.';
    RETURN;
  END IF;

  -- Make room at position 3, highest first so nothing collides.
  IF v_swim IS NOT NULL THEN
    UPDATE public.training_blocks SET position = 5 WHERE id = v_swim;
  END IF;
  UPDATE public.training_blocks SET position = 4 WHERE id = v_run2;

  INSERT INTO public.training_blocks (plan_id, name, position, weeks)
  VALUES (v_plan2, 'Off — injury', 3, 1);

  UPDATE public.training_plans
     SET start_date = date '2026-09-21' WHERE id = v_plan2;

  RAISE NOTICE 'Off week inserted; Plan 2 now starts 2026-09-21.';
END $$;
