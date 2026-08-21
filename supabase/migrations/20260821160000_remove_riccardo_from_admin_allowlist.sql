-- riccardo.lovo21@gmail.com is now an athlete-only account. The signup
-- trigger's hard-coded admin allow-list previously auto-granted it admin
-- (and, transiently in an earlier version, a coach row) on account
-- creation. Drop it from the allow-list so a future re-signup (e.g. after
-- an account deletion) can't silently re-grant admin/coach access.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(NEW.email);
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role','coach');
  v_token text := NEW.raw_user_meta_data->>'invite_token';
  v_invite public.client_invites%ROWTYPE;
  v_is_admin boolean := v_email = 'paganinriccardo@gmail.com';
BEGIN
  -- Hard-coded admin allow-list: short-circuit normal flow
  IF v_is_admin THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    INSERT INTO public.coaches (id, name, email)
      VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email)
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'coach') ON CONFLICT DO NOTHING;
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

-- Clean up the stray coaches row from before this account was split into
-- athlete-only (paganinriccardo@gmail.com is the coach now).
DELETE FROM public.coaches WHERE id = 'b8c8df4b-983e-4467-a139-e87322d9554e';
