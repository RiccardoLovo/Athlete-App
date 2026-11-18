-- The athlete owns their own numbers.
--
-- Thresholds and heart-rate zones were coach-write only, which put the
-- input on a screen the athlete cannot reach — and they are the one with
-- the watch, the ramp test and the time trial. Weight and 1RM already
-- work this way; these now match.
--
-- The coach keeps full access and can override, and every row records who
-- entered it, so a number that moved can be traced to a person rather
-- than appearing to have changed itself.

ALTER TABLE public.client_threshold_tests
  ADD COLUMN IF NOT EXISTS entered_by uuid DEFAULT auth.uid();

ALTER TABLE public.client_hr_zones
  ADD COLUMN IF NOT EXISTS entered_by uuid DEFAULT auth.uid();

COMMENT ON COLUMN public.client_threshold_tests.entered_by IS
  'Who recorded this measurement — the athlete or their coach.';

-- An athlete may manage rows for their own client record only, and may
-- not hand the row to a different coach: coach_id is checked against the
-- client it belongs to rather than taken on trust from the request.
DROP POLICY IF EXISTS "athlete manages own threshold tests"
  ON public.client_threshold_tests;
CREATE POLICY "athlete manages own threshold tests"
  ON public.client_threshold_tests
  FOR ALL TO authenticated
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  )
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    AND coach_id = (
      SELECT c.coach_id FROM public.clients c WHERE c.id = client_id
    )
  );

DROP POLICY IF EXISTS "athlete manages own hr zones" ON public.client_hr_zones;
CREATE POLICY "athlete manages own hr zones"
  ON public.client_hr_zones
  FOR ALL TO authenticated
  USING (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
  )
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    AND coach_id = (
      SELECT c.coach_id FROM public.clients c WHERE c.id = client_id
    )
  );
