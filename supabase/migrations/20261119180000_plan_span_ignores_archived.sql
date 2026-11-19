-- A plan's span is its scheduled weeks, not its written ones.
--
-- plan_end_date and the no-overlap trigger both sum weeks across every
-- block, archived or not. That was right when archived did not exist and
-- is wrong now: an archived block holds no dates, lends no weeks to any
-- other calculation in the app, and must not reserve calendar space that
-- then blocks a real plan from being scheduled.
--
-- Found by hitting it — moving a parked swim block into a new plan was
-- refused for overlapping a plan whose remaining weeks had already moved
-- out from under it.

CREATE OR REPLACE FUNCTION public.plan_end_date(_plan_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (p.start_date + ((COALESCE((SELECT SUM(b.weeks) FROM public.training_blocks b
                                      WHERE b.plan_id = p.id AND NOT b.archived), 0) * 7 - 1)
          || ' days')::interval)::date
  FROM public.training_plans p WHERE p.id = _plan_id;
$$;

CREATE OR REPLACE FUNCTION public.validate_plan_no_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_plan_id uuid; v_athlete uuid; v_start date; v_end date; v_conflict int;
BEGIN
  IF TG_TABLE_NAME = 'training_plans' THEN
    v_plan_id := NEW.id;
  ELSE
    v_plan_id := COALESCE(NEW.plan_id, OLD.plan_id);
  END IF;
  SELECT athlete_id, start_date INTO v_athlete, v_start FROM public.training_plans WHERE id = v_plan_id;
  IF v_athlete IS NULL THEN RETURN NEW; END IF;
  v_end := (v_start + ((COALESCE((SELECT SUM(weeks) FROM public.training_blocks
                                  WHERE plan_id = v_plan_id AND NOT archived), 0) * 7 - 1)
            || ' days')::interval)::date;
  SELECT count(*) INTO v_conflict
  FROM public.training_plans p2
  WHERE p2.athlete_id = v_athlete
    AND p2.id <> v_plan_id
    AND daterange(
          p2.start_date,
          (p2.start_date + ((COALESCE((SELECT SUM(weeks) FROM public.training_blocks
                                        WHERE plan_id = p2.id AND NOT archived), 0) * 7)
           || ' days')::interval)::date,
          '[)')
        && daterange(v_start, (v_end + 1)::date, '[)');
  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'Plan date range overlaps another plan for this athlete' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
