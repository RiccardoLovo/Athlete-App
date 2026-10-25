-- New "structured workout" authoring path for Running/Swimming/Cycling,
-- modeled on Zwift's block-based builder but kept as our existing
-- written/vertical list UI rather than a visual timeline.
--
-- Deliberately additive and isolated: nothing here touches existing
-- session_exercises/prescription_intervals rows or their meaning. Old
-- plans keep rendering exactly as they always have. New Run/Swim/Bike
-- exercises reference one of three seeded "container" exercises
-- (is_structured_container = true) and carry their structure as an
-- ordered list of workout_blocks instead of the single
-- structure_type/template_type model.

ALTER TABLE public.exercises
  ADD COLUMN is_structured_container boolean NOT NULL DEFAULT false;

ALTER TABLE public.session_exercises
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}';

INSERT INTO public.exercises
  (name_en, name_it, discipline, category, is_global, is_structured_container, structure_type)
VALUES
  ('Run', 'Corsa', 'Running', 'Cardio', true, true, 'simple'),
  ('Swim', 'Nuoto', 'Swimming', 'Cardio', true, true, 'simple'),
  ('Bike', 'Bici', 'Cycling', 'Cardio', true, true, 'simple');

CREATE TABLE public.workout_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_exercise_id uuid NOT NULL REFERENCES public.session_exercises(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  block_type text NOT NULL CHECK (block_type IN ('warmup', 'cooldown', 'steady', 'drill', 'intervals', 'pyramid')),
  label text,
  -- Exactly one of distance_km/duration_min is the coach's primary target;
  -- target_mode says which. The other may still be filled in as secondary
  -- reference info (e.g. an expected duration alongside a distance target).
  target_mode text CHECK (target_mode IN ('distance', 'time')),
  distance_km numeric,
  duration_min numeric,
  pace text,
  -- Zone is a quick-pick starting point; pct_threshold is the coach's
  -- exact refinement (may differ from the zone's own range once dialed
  -- in). Both optional, independent of each other.
  zone int CHECK (zone BETWEEN 1 AND 5),
  pct_threshold numeric,
  -- Intervals-block fields; 'pyramid' blocks store their shape via the
  -- linked prescription_intervals rows instead (reusing the existing
  -- pyramid generator), these two are pyramid-specific knobs kept here
  -- for convenience when re-opening the builder.
  interval_count int,
  double_peak boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workout_blocks_session_exercise_id
  ON public.workout_blocks(session_exercise_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_blocks TO authenticated;
ALTER TABLE public.workout_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach manages own workout_blocks" ON public.workout_blocks
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
        JOIN public.sessions s ON s.id = se.session_id
        JOIN public.training_blocks b ON b.id = s.block_id
        JOIN public.training_plans p ON p.id = b.plan_id
      WHERE se.id = workout_blocks.session_exercise_id AND p.coach_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
        JOIN public.sessions s ON s.id = se.session_id
        JOIN public.training_blocks b ON b.id = s.block_id
        JOIN public.training_plans p ON p.id = b.plan_id
      WHERE se.id = workout_blocks.session_exercise_id AND p.coach_id = auth.uid()
    )
  );

CREATE POLICY "athlete reads own workout_blocks" ON public.workout_blocks
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.session_exercises se
        JOIN public.sessions s ON s.id = se.session_id
        JOIN public.training_blocks b ON b.id = s.block_id
        JOIN public.training_plans p ON p.id = b.plan_id
        JOIN public.clients c ON c.id = p.athlete_id
      WHERE se.id = workout_blocks.session_exercise_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin all access" ON public.workout_blocks
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Intervals/pyramid blocks store their round-by-round data in the existing
-- prescription_intervals table, scoped by this new column instead of
-- (or alongside) session_exercise_id — a session_exercise can now contain
-- several independent intervals/pyramid blocks, not just one.
ALTER TABLE public.prescription_intervals
  ADD COLUMN workout_block_id uuid REFERENCES public.workout_blocks(id) ON DELETE CASCADE;

CREATE INDEX idx_prescription_intervals_workout_block_id
  ON public.prescription_intervals(workout_block_id) WHERE workout_block_id IS NOT NULL;
