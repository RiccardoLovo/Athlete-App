
-- Roles
CREATE TYPE public.app_role AS ENUM ('coach','athlete');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

-- Backfill existing coaches
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'coach'::public.app_role FROM public.coaches
ON CONFLICT DO NOTHING;

-- Link clients to optional athlete account
ALTER TABLE public.clients
  ADD COLUMN user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_clients_user ON public.clients(user_id);

-- Invites
CREATE TABLE public.client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT replace(encode(gen_random_bytes(18),'base64'),'/','_'),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_invites_token ON public.client_invites(token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invites TO authenticated;
GRANT SELECT ON public.client_invites TO anon;
GRANT ALL ON public.client_invites TO service_role;
ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coach manages own invites" ON public.client_invites
  FOR ALL TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Anyone can read invite" ON public.client_invites
  FOR SELECT TO anon USING (true);

-- Replace signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role','coach');
  v_token text := NEW.raw_user_meta_data->>'invite_token';
  v_invite public.client_invites%ROWTYPE;
BEGIN
  IF v_role = 'athlete' THEN
    IF v_token IS NULL THEN RAISE EXCEPTION 'Athlete signup requires an invite link'; END IF;
    SELECT * INTO v_invite FROM public.client_invites
      WHERE token = v_token AND used_at IS NULL LIMIT 1;
    IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invalid or already-used invite'; END IF;
    UPDATE public.clients
      SET user_id = NEW.id,
          email = CASE WHEN email = '' THEN NEW.email ELSE email END
      WHERE id = v_invite.client_id;
    UPDATE public.client_invites SET used_at = now(), used_by = NEW.id WHERE id = v_invite.id;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'athlete') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.coaches (id, name, email)
      VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email)
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'coach') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Athlete RLS
CREATE POLICY "Athlete reads own client row" ON public.clients
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Athlete reads own mesocycles" ON public.mesocycles
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = mesocycles.client_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Athlete reads own weeks" ON public.training_weeks
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.mesocycles m JOIN public.clients c ON c.id=m.client_id
    WHERE m.id = training_weeks.mesocycle_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Athlete reads own sessions" ON public.sessions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.training_weeks w
      JOIN public.mesocycles m ON m.id=w.mesocycle_id
      JOIN public.clients c ON c.id=m.client_id
    WHERE w.id = sessions.week_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Athlete reads own session_exercises" ON public.session_exercises
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sessions s
      JOIN public.training_weeks w ON w.id=s.week_id
      JOIN public.mesocycles m ON m.id=w.mesocycle_id
      JOIN public.clients c ON c.id=m.client_id
    WHERE s.id = session_exercises.session_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "All authenticated read exercises" ON public.exercises
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Athlete logs own workouts" ON public.workout_logs
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = workout_logs.client_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "Athlete reads own workout_logs" ON public.workout_logs
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = workout_logs.client_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Athlete writes exercise_logs" ON public.exercise_logs
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_logs wl JOIN public.clients c ON c.id=wl.client_id
    WHERE wl.id = exercise_logs.workout_log_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "Athlete reads own exercise_logs" ON public.exercise_logs
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workout_logs wl JOIN public.clients c ON c.id=wl.client_id
    WHERE wl.id = exercise_logs.workout_log_id AND c.user_id = auth.uid()
  ));
