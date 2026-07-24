
DO $$ BEGIN
  CREATE TYPE public.plan_status AS ENUM ('draft','active','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  athlete_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  status public.plan_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_plans TO authenticated;
GRANT ALL ON public.training_plans TO service_role;
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach manages own plans" ON public.training_plans
  FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "athlete reads own plans" ON public.training_plans
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = athlete_id AND c.user_id = auth.uid()));
CREATE UNIQUE INDEX one_active_plan_per_athlete
  ON public.training_plans (athlete_id) WHERE status = 'active';
CREATE INDEX training_plans_athlete_idx ON public.training_plans (athlete_id, start_date);

CREATE TABLE public.training_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL,
  weeks integer NOT NULL CHECK (weeks > 0 AND weeks <= 52),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, position) DEFERRABLE INITIALLY DEFERRED
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_blocks TO authenticated;
GRANT ALL ON public.training_blocks TO service_role;
ALTER TABLE public.training_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach manages own blocks" ON public.training_blocks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_plans p WHERE p.id = plan_id AND p.coach_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_plans p WHERE p.id = plan_id AND p.coach_id = auth.uid()));
CREATE POLICY "athlete reads own blocks" ON public.training_blocks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.training_plans p JOIN public.clients c ON c.id = p.athlete_id
    WHERE p.id = plan_id AND c.user_id = auth.uid()
  ));
CREATE INDEX training_blocks_plan_idx ON public.training_blocks (plan_id, position);

ALTER TABLE public.sessions ADD COLUMN block_id uuid REFERENCES public.training_blocks(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN week_number integer;
ALTER TABLE public.sessions ADD COLUMN day_of_week integer;
ALTER TABLE public.sessions ADD COLUMN name text;
ALTER TABLE public.sessions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "Coach sessions" ON public.sessions;
DROP POLICY IF EXISTS "Athlete reads own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Admin all access" ON public.sessions;
DROP POLICY IF EXISTS "Coach session_exercises" ON public.session_exercises;
DROP POLICY IF EXISTS "Athlete reads own session_exercises" ON public.session_exercises;
DROP POLICY IF EXISTS "Admin all access" ON public.session_exercises;
DROP POLICY IF EXISTS "Coach training_weeks" ON public.training_weeks;
DROP POLICY IF EXISTS "Athlete reads own weeks" ON public.training_weeks;
DROP POLICY IF EXISTS "Admin all access" ON public.training_weeks;
DROP POLICY IF EXISTS "Coach mesocycles" ON public.mesocycles;
DROP POLICY IF EXISTS "Athlete reads own mesocycles" ON public.mesocycles;
DROP POLICY IF EXISTS "Admin all access" ON public.mesocycles;

DO $mig$
DECLARE
  m record; v_plan_id uuid; v_block_id uuid; v_week_count int;
BEGIN
  FOR m IN SELECT * FROM public.mesocycles LOOP
    SELECT count(*) INTO v_week_count FROM public.training_weeks WHERE mesocycle_id = m.id;
    IF v_week_count = 0 THEN v_week_count := COALESCE(m.total_weeks, 4); END IF;
    INSERT INTO public.training_plans (coach_id, athlete_id, name, start_date, status)
    VALUES (m.coach_id, m.client_id, 'Plan 1', CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7), 'active')
    RETURNING id INTO v_plan_id;
    INSERT INTO public.training_blocks (plan_id, name, position, weeks)
    VALUES (v_plan_id, 'Block 1', 1, v_week_count)
    RETURNING id INTO v_block_id;
    UPDATE public.sessions s
       SET block_id = v_block_id,
           week_number = tw.week_number,
           day_of_week = CASE WHEN s.day_number BETWEEN 1 AND 7 THEN s.day_number ELSE 1 END
      FROM public.training_weeks tw
     WHERE s.week_id = tw.id AND tw.mesocycle_id = m.id;
  END LOOP;
END $mig$;

DELETE FROM public.sessions WHERE block_id IS NULL;

WITH ranked AS (
  SELECT s.id,
         row_number() OVER (
           PARTITION BY s.block_id, s.week_number, s.day_of_week
           ORDER BY (SELECT count(*) FROM public.session_exercises se WHERE se.session_id = s.id) DESC, s.created_at ASC, s.id ASC
         ) AS rn
    FROM public.sessions s
)
DELETE FROM public.sessions WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.sessions ALTER COLUMN block_id SET NOT NULL;
ALTER TABLE public.sessions ALTER COLUMN week_number SET NOT NULL;
ALTER TABLE public.sessions ALTER COLUMN day_of_week SET NOT NULL;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_day_of_week_chk CHECK (day_of_week BETWEEN 1 AND 7);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_week_number_chk CHECK (week_number >= 1);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_unique_slot UNIQUE (block_id, week_number, day_of_week);

ALTER TABLE public.sessions DROP COLUMN week_id;
ALTER TABLE public.sessions DROP COLUMN day_number;
ALTER TABLE public.sessions DROP COLUMN day_label;
ALTER TABLE public.sessions DROP COLUMN slot;

DROP TABLE public.training_weeks;
DROP TABLE public.mesocycles;

CREATE POLICY "coach manages own sessions" ON public.sessions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id WHERE b.id = block_id AND p.coach_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id WHERE b.id = block_id AND p.coach_id = auth.uid()));

CREATE POLICY "athlete reads own sessions" ON public.sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
    WHERE b.id = block_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "coach manages own session_exercises" ON public.session_exercises
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id
    WHERE s.id = session_id AND p.coach_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id
    WHERE s.id = session_id AND p.coach_id = auth.uid()
  ));

CREATE POLICY "athlete reads own session_exercises" ON public.session_exercises
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s JOIN public.training_blocks b ON b.id = s.block_id JOIN public.training_plans p ON p.id = b.plan_id JOIN public.clients c ON c.id = p.athlete_id
    WHERE s.id = session_id AND c.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.plan_end_date(_plan_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (p.start_date + ((COALESCE((SELECT SUM(b.weeks) FROM public.training_blocks b WHERE b.plan_id = p.id), 0) * 7 - 1) || ' days')::interval)::date
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
  v_end := (v_start + ((COALESCE((SELECT SUM(weeks) FROM public.training_blocks WHERE plan_id = v_plan_id), 0) * 7 - 1) || ' days')::interval)::date;
  SELECT count(*) INTO v_conflict
  FROM public.training_plans p2
  WHERE p2.athlete_id = v_athlete
    AND p2.id <> v_plan_id
    AND daterange(
          p2.start_date,
          (p2.start_date + ((COALESCE((SELECT SUM(weeks) FROM public.training_blocks WHERE plan_id = p2.id), 0) * 7) || ' days')::interval)::date,
          '[)')
        && daterange(v_start, (v_end + 1)::date, '[)');
  IF v_conflict > 0 THEN
    RAISE EXCEPTION 'Plan date range overlaps another plan for this athlete' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER plans_no_overlap
  AFTER INSERT OR UPDATE OF start_date, athlete_id ON public.training_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_plan_no_overlap();
CREATE TRIGGER blocks_no_overlap
  AFTER INSERT OR UPDATE OR DELETE ON public.training_blocks
  FOR EACH ROW EXECUTE FUNCTION public.validate_plan_no_overlap();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER training_plans_touch BEFORE UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER training_blocks_touch BEFORE UPDATE ON public.training_blocks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sessions_touch BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.copy_week(_block_id uuid, _source_week int, _target_week int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; new_session_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.training_blocks b JOIN public.training_plans p ON p.id = b.plan_id WHERE b.id = _block_id AND p.coach_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _source_week = _target_week THEN RETURN; END IF;
  DELETE FROM public.sessions WHERE block_id = _block_id AND week_number = _target_week;
  FOR s IN SELECT * FROM public.sessions WHERE block_id = _block_id AND week_number = _source_week LOOP
    INSERT INTO public.sessions (block_id, week_number, day_of_week, name, notes, status, is_optional, training_category_tags, body_region)
    VALUES (s.block_id, _target_week, s.day_of_week, s.name, s.notes, COALESCE(s.status,'planned'), s.is_optional, s.training_category_tags, s.body_region)
    RETURNING id INTO new_session_id;
    INSERT INTO public.session_exercises
      (session_id, exercise_id, order_index, sets, reps, notes, group_id, group_type, target_mode, rpe, load_mode, load_value, rest_sec, distance_km, duration_min, pace, hr_zone, tempo, prescription)
    SELECT new_session_id, exercise_id, order_index, sets, reps, notes, group_id, group_type, target_mode, rpe, load_mode, load_value, rest_sec, distance_km, duration_min, pace, hr_zone, tempo, prescription
      FROM public.session_exercises WHERE session_id = s.id;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.copy_week(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_end_date(uuid) TO authenticated;
