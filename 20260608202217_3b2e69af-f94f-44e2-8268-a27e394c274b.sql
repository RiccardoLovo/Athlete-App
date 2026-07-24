
-- Coaches
CREATE TABLE public.coaches (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaches TO authenticated;
GRANT ALL ON public.coaches TO service_role;
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coaches own data" ON public.coaches FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Auto-create coach on signup
CREATE OR REPLACE FUNCTION public.handle_new_coach()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.coaches (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_coach();

-- Exercises
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sport TEXT NOT NULL DEFAULT 'General',
  movement_pattern TEXT NOT NULL DEFAULT '',
  contraction_type TEXT NOT NULL DEFAULT '',
  goal_tags TEXT[] NOT NULL DEFAULT '{}',
  equipment TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  default_sets TEXT NOT NULL DEFAULT '',
  default_reps TEXT NOT NULL DEFAULT '',
  default_tempo TEXT NOT NULL DEFAULT '',
  default_rest TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises TO authenticated;
GRANT SELECT ON public.exercises TO anon;
GRANT ALL ON public.exercises TO service_role;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach exercises" ON public.exercises FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Public can read exercises" ON public.exercises FOR SELECT TO anon USING (true);

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  sport TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT ON public.clients TO anon;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach clients" ON public.clients FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Public can read clients" ON public.clients FOR SELECT TO anon USING (true);

-- Mesocycles
CREATE TABLE public.mesocycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL DEFAULT 1,
  total_weeks INTEGER NOT NULL DEFAULT 4,
  deload_week INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mesocycles TO authenticated;
GRANT SELECT ON public.mesocycles TO anon;
GRANT ALL ON public.mesocycles TO service_role;
ALTER TABLE public.mesocycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach mesocycles" ON public.mesocycles FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Public can read mesocycles" ON public.mesocycles FOR SELECT TO anon USING (true);

-- Training weeks
CREATE TABLE public.training_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mesocycle_id UUID NOT NULL REFERENCES public.mesocycles(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  week_type TEXT NOT NULL DEFAULT 'training',
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_weeks TO authenticated;
GRANT SELECT ON public.training_weeks TO anon;
GRANT ALL ON public.training_weeks TO service_role;
ALTER TABLE public.training_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach training_weeks" ON public.training_weeks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mesocycles m WHERE m.id = mesocycle_id AND m.coach_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mesocycles m WHERE m.id = mesocycle_id AND m.coach_id = auth.uid()));
CREATE POLICY "Public can read training_weeks" ON public.training_weeks FOR SELECT TO anon USING (true);

-- Sessions
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES public.training_weeks(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  day_label TEXT NOT NULL DEFAULT '',
  slot INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  is_optional BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT SELECT ON public.sessions TO anon;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach sessions" ON public.sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_weeks w JOIN public.mesocycles m ON m.id = w.mesocycle_id WHERE w.id = week_id AND m.coach_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_weeks w JOIN public.mesocycles m ON m.id = w.mesocycle_id WHERE w.id = week_id AND m.coach_id = auth.uid()));
CREATE POLICY "Public can read sessions" ON public.sessions FOR SELECT TO anon USING (true);

-- Session exercises
CREATE TABLE public.session_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  sets TEXT NOT NULL DEFAULT '',
  reps TEXT NOT NULL DEFAULT '',
  weight TEXT NOT NULL DEFAULT '',
  tempo TEXT NOT NULL DEFAULT '',
  rest TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  group_id TEXT NOT NULL DEFAULT '',
  group_type TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_exercises TO authenticated;
GRANT SELECT ON public.session_exercises TO anon;
GRANT ALL ON public.session_exercises TO service_role;
ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach session_exercises" ON public.session_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.training_weeks w ON w.id = s.week_id
    JOIN public.mesocycles m ON m.id = w.mesocycle_id
    WHERE s.id = session_id AND m.coach_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sessions s
    JOIN public.training_weeks w ON w.id = s.week_id
    JOIN public.mesocycles m ON m.id = w.mesocycle_id
    WHERE s.id = session_id AND m.coach_id = auth.uid()));
CREATE POLICY "Public can read session_exercises" ON public.session_exercises FOR SELECT TO anon USING (true);

-- Workout logs
CREATE TABLE public.workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  borg_scale INTEGER NOT NULL DEFAULT 5 CHECK (borg_scale BETWEEN 1 AND 10),
  overall_notes TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_logs TO authenticated;
GRANT SELECT, INSERT ON public.workout_logs TO anon;
GRANT ALL ON public.workout_logs TO service_role;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach workout_logs" ON public.workout_logs FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Public can read workout_logs" ON public.workout_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert workout_logs" ON public.workout_logs FOR INSERT TO anon WITH CHECK (true);

-- Exercise logs
CREATE TABLE public.exercise_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_log_id UUID NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
  session_exercise_id UUID NOT NULL REFERENCES public.session_exercises(id) ON DELETE CASCADE,
  weight_done TEXT NOT NULL DEFAULT '',
  reps_done TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_logs TO authenticated;
GRANT SELECT, INSERT ON public.exercise_logs TO anon;
GRANT ALL ON public.exercise_logs TO service_role;
ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach exercise_logs" ON public.exercise_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workout_logs wl WHERE wl.id = workout_log_id AND wl.coach_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workout_logs wl WHERE wl.id = workout_log_id AND wl.coach_id = auth.uid()));
CREATE POLICY "Public can read exercise_logs" ON public.exercise_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert exercise_logs" ON public.exercise_logs FOR INSERT TO anon WITH CHECK (true);

-- Indexes
CREATE INDEX idx_exercises_coach ON public.exercises(coach_id);
CREATE INDEX idx_clients_coach ON public.clients(coach_id);
CREATE INDEX idx_mesocycles_client ON public.mesocycles(client_id);
CREATE INDEX idx_training_weeks_meso ON public.training_weeks(mesocycle_id);
CREATE INDEX idx_sessions_week ON public.sessions(week_id);
CREATE INDEX idx_session_exercises_session ON public.session_exercises(session_id);
CREATE INDEX idx_workout_logs_coach_status ON public.workout_logs(coach_id, status);
CREATE INDEX idx_workout_logs_session ON public.workout_logs(session_id);
