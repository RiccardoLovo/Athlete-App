DROP POLICY IF EXISTS "Public can read training_weeks" ON public.training_weeks;
REVOKE SELECT ON public.training_weeks FROM anon;