-- The restart moves to Monday 30 Nov.
--
-- Done by giving the off block a second week rather than moving the plan
-- start again. Shifting the start would drag Bike and Run to new dates
-- for the second time, and those two blocks hold 14 real logs — their
-- planned dates have already been rewritten once by this restructure and
-- every move makes the record of what was actually trained harder to
-- read. The off period is the part that is genuinely growing.
--
--   Bike          4w  21 Sep – 18 Oct   unchanged
--   Run           4w  19 Oct – 15 Nov   unchanged
--   Off — injury  2w  16 Nov – 29 Nov   <- was 1w
--   Run 2         4w  30 Nov – 27 Dec   <- the restart
--
-- REVERSAL: UPDATE training_blocks SET weeks = 1
--             WHERE plan_id='1e938150-30dd-4064-bbfd-db58a45e279c'
--               AND name='Off — injury';

DO $$
DECLARE v_plan2 uuid := '1e938150-30dd-4064-bbfd-db58a45e279c'; v_off uuid;
BEGIN
  SELECT id INTO v_off FROM public.training_blocks
   WHERE plan_id = v_plan2 AND name = 'Off — injury';
  IF v_off IS NULL THEN
    RAISE NOTICE 'Off block not present — skipping, changing nothing.';
    RETURN;
  END IF;
  UPDATE public.training_blocks SET weeks = 2 WHERE id = v_off;
  RAISE NOTICE 'Off block now 2 weeks; Run 2 starts 2026-11-30.';
END $$;
