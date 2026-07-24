REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_coach() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_invite_info(text) FROM anon;