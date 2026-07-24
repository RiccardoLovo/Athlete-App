
-- 1. Extend exercises
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS template_type TEXT,
  ADD COLUMN IF NOT EXISTS template_defaults JSONB;

ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_structure_type_check;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_structure_type_check
  CHECK (structure_type IN ('simple','intervals','template'));

ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_template_type_check;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_template_type_check
  CHECK (template_type IS NULL OR template_type IN ('rsa','pyramid'));

ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_structure_template_consistency;
ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_structure_template_consistency
  CHECK ((structure_type = 'template') = (template_type IS NOT NULL));

-- 2. Track when a prescription's intervals were last generated from a template
ALTER TABLE public.session_exercises
  ADD COLUMN IF NOT EXISTS template_generated_at TIMESTAMPTZ;

-- 3. New table prescription_intervals
CREATE TABLE IF NOT EXISTS public.prescription_intervals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id UUID NOT NULL REFERENCES public.session_exercises(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  label TEXT,
  target_value NUMERIC,
  target_unit TEXT NOT NULL DEFAULT 'meters' CHECK (target_unit IN ('meters','seconds','minutes')),
  pace_per_km TEXT,
  hr_zone INTEGER CHECK (hr_zone BETWEEN 1 AND 5),
  watts INTEGER,
  cadence INTEGER,
  stroke TEXT,
  intensity TEXT,
  rest_seconds INTEGER,
  rest_type TEXT DEFAULT 'passive' CHECK (rest_type IN ('passive','active')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_exercise_id, order_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_intervals TO authenticated;
GRANT ALL ON public.prescription_intervals TO service_role;

ALTER TABLE public.prescription_intervals ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins manage all prescription intervals"
  ON public.prescription_intervals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Coaches: manage intervals for sessions in their plans
CREATE POLICY "Coaches manage intervals in their plans"
  ON public.prescription_intervals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      WHERE se.id = prescription_intervals.session_exercise_id
        AND p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      WHERE se.id = prescription_intervals.session_exercise_id
        AND p.coach_id = auth.uid()
    )
  );

-- Athletes: read intervals on plans assigned to them
CREATE POLICY "Athletes view their interval prescriptions"
  ON public.prescription_intervals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
      JOIN public.sessions s ON s.id = se.session_id
      JOIN public.training_blocks b ON b.id = s.block_id
      JOIN public.training_plans p ON p.id = b.plan_id
      JOIN public.clients c ON c.id = p.athlete_id
      WHERE se.id = prescription_intervals.session_exercise_id
        AND c.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_prescription_intervals_se
  ON public.prescription_intervals(session_exercise_id, order_index);

-- updated_at trigger
CREATE TRIGGER trg_prescription_intervals_touch
  BEFORE UPDATE ON public.prescription_intervals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Bump parent session updated_at when intervals change (for realtime/cache)
CREATE OR REPLACE FUNCTION public.touch_session_from_interval()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_session_id uuid;
BEGIN
  SELECT session_id INTO v_session_id FROM public.session_exercises
    WHERE id = COALESCE(NEW.session_exercise_id, OLD.session_exercise_id);
  IF v_session_id IS NOT NULL THEN
    UPDATE public.sessions SET updated_at = now() WHERE id = v_session_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_prescription_intervals_bump_session
  AFTER INSERT OR UPDATE OR DELETE ON public.prescription_intervals
  FOR EACH ROW EXECUTE FUNCTION public.touch_session_from_interval();
