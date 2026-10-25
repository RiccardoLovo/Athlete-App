-- Athlete threshold tests (bike FTP, swim CSS) — versioned/dated like
-- client_exercise_1rm, so progression over time is tracked rather than a
-- single overwritten value. Used to auto-calculate Z1-Z5 training targets
-- (watts for bike, pace for swim) in the interval builder and RSA
-- template generator.
CREATE TABLE public.client_threshold_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- 'ftp_watts': bike FTP, stored in watts.
  -- 'css_pace_sec_per_100m': swim critical swim speed, stored as seconds
  -- per 100m (pace "1:32" -> 92).
  metric text NOT NULL CHECK (metric IN ('ftp_watts', 'css_pace_sec_per_100m')),
  value numeric NOT NULL,
  tested_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_threshold_tests TO authenticated;
GRANT ALL ON public.client_threshold_tests TO service_role;

ALTER TABLE public.client_threshold_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach can read own threshold tests" ON public.client_threshold_tests
  FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "coach can insert own threshold tests" ON public.client_threshold_tests
  FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach can update own threshold tests" ON public.client_threshold_tests
  FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach can delete own threshold tests" ON public.client_threshold_tests
  FOR DELETE TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "Admin all access" ON public.client_threshold_tests
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Athletes can read their own threshold tests (for their own dashboard, if
-- ever surfaced there), mirroring how 1RM read-access could later extend.
CREATE POLICY "athlete can read own threshold tests" ON public.client_threshold_tests
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE INDEX client_threshold_tests_lookup_idx
  ON public.client_threshold_tests (client_id, metric, tested_date DESC);
