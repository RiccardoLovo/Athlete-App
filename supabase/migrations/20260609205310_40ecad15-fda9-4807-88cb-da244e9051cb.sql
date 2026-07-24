
-- 1) Exercise table: category tags + body region
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS category_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS body_region text;

-- 2) session_exercises: weight unit
ALTER TABLE public.session_exercises
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'kg';

-- 3) client_exercise_1rm table
CREATE TABLE IF NOT EXISTS public.client_exercise_1rm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  value_kg numeric NOT NULL,
  tested_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_exercise_1rm TO authenticated;
GRANT ALL ON public.client_exercise_1rm TO service_role;

ALTER TABLE public.client_exercise_1rm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach can read own 1rm" ON public.client_exercise_1rm
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach can insert own 1rm" ON public.client_exercise_1rm
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach can update own 1rm" ON public.client_exercise_1rm
  FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach can delete own 1rm" ON public.client_exercise_1rm
  FOR DELETE TO authenticated USING (coach_id = auth.uid());

CREATE INDEX IF NOT EXISTS client_1rm_lookup_idx
  ON public.client_exercise_1rm (client_id, exercise_id, tested_date DESC);
