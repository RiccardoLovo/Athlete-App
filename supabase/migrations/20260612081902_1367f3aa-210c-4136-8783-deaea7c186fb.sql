-- 1) Wipe all data for clean slate
DELETE FROM public.exercise_logs;
DELETE FROM public.workout_logs;
DELETE FROM public.session_exercises;
DELETE FROM public.sessions;
DELETE FROM public.training_weeks;
DELETE FROM public.mesocycles;
DELETE FROM public.client_exercise_1rm;
DELETE FROM public.client_invites;
DELETE FROM public.clients;
DELETE FROM public.exercises;
DELETE FROM public.coaches;
DELETE FROM public.user_roles;
DELETE FROM auth.users;

-- 2) Drop policies that reference has_role so we can rebuild the enum
DROP POLICY IF EXISTS "Athletes update own workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Coaches manage own workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Deny athlete deletes on workout logs" ON public.workout_logs;

-- 3) Rebuild app_role enum to include 'admin'
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text;
DROP TYPE public.app_role;
CREATE TYPE public.app_role AS ENUM ('coach', 'athlete', 'admin');
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role USING role::public.app_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

-- 4) Recreate the policies we dropped
CREATE POLICY "Athletes update own workout logs" ON public.workout_logs
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'athlete') AND (client_id IN (SELECT id FROM public.clients WHERE user_id=auth.uid())));
CREATE POLICY "Coaches manage own workout logs" ON public.workout_logs
  FOR ALL
  USING ((coach_id = auth.uid()) AND public.has_role(auth.uid(), 'coach'))
  WITH CHECK ((coach_id = auth.uid()) AND public.has_role(auth.uid(), 'coach'));
CREATE POLICY "Deny athlete deletes on workout logs" ON public.workout_logs
  FOR DELETE
  USING (public.has_role(auth.uid(), 'coach') AND (coach_id = auth.uid()));

-- 5) Admin override policies on every coach-scoped table
CREATE POLICY "Admin all access" ON public.clients FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.mesocycles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.training_weeks FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.sessions FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.session_exercises FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.exercises FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.workout_logs FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.exercise_logs FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.client_exercise_1rm FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin all access" ON public.client_invites FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin reads all coaches" ON public.coaches FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin reads all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 6) Update handle_new_user with hard-coded admin allow-list
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(NEW.email);
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role','coach');
  v_token text := NEW.raw_user_meta_data->>'invite_token';
  v_invite public.client_invites%ROWTYPE;
  v_is_admin boolean := v_email IN ('riccardo.lovo21@gmail.com','paganinriccardo@gmail.com');
  v_admin_is_coach boolean := v_email = 'paganinriccardo@gmail.com';
BEGIN
  -- Hard-coded admin allow-list: short-circuit normal flow
  IF v_is_admin THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    IF v_admin_is_coach THEN
      INSERT INTO public.coaches (id, name, email)
        VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email)
        ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'coach') ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  IF v_role = 'athlete' THEN
    IF v_token IS NULL THEN RAISE EXCEPTION 'Athlete signup requires an invite link'; END IF;
    SELECT * INTO v_invite FROM public.client_invites WHERE token = v_token AND used_at IS NULL LIMIT 1;
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