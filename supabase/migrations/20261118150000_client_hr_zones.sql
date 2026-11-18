-- Heart-rate zones an athlete already has, entered as they are.
--
-- Deriving bands from LTHR is a fallback for athletes who have never had
-- them set. An athlete whose watch already carries zones — tested, or set
-- by their own coach or device — has better numbers than any percentage
-- model, and those should win outright rather than be recomputed into
-- something slightly different that then disagrees with the watch on
-- their wrist mid-session.
--
-- discipline is nullable: most devices give one set for everything, but
-- a coach who has sport-specific bands can store those too. NULLS NOT
-- DISTINCT so a second "all sports" row for the same zone collides
-- rather than silently shadowing the first.

CREATE TABLE IF NOT EXISTS public.client_hr_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- NULL means "every sport".
  discipline text CHECK (discipline IN ('Running', 'Cycling', 'Swimming')),
  zone int NOT NULL CHECK (zone BETWEEN 1 AND 5),
  min_bpm int NOT NULL CHECK (min_bpm > 0 AND min_bpm < 260),
  max_bpm int NOT NULL CHECK (max_bpm > 0 AND max_bpm < 260),
  -- Where they came from, so a stale set can be recognised later.
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_bpm >= min_bpm),
  CONSTRAINT client_hr_zones_unique UNIQUE NULLS NOT DISTINCT
    (client_id, discipline, zone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_hr_zones TO authenticated;
GRANT ALL ON public.client_hr_zones TO service_role;

ALTER TABLE public.client_hr_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach manages own hr zones" ON public.client_hr_zones
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- The athlete reads their own, since their session screens show the band.
CREATE POLICY "athlete reads own hr zones" ON public.client_hr_zones
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Admin all access" ON public.client_hr_zones
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS client_hr_zones_client_idx
  ON public.client_hr_zones (client_id);
