ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS training_category_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS body_region text;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_body_region_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_body_region_check
  CHECK (body_region IS NULL OR body_region IN ('upper','lower','full'));