
DELETE FROM public.exercise_logs;
DELETE FROM public.session_exercises;

ALTER TABLE public.session_exercises
  DROP COLUMN IF EXISTS weight,
  DROP COLUMN IF EXISTS weight_unit,
  DROP COLUMN IF EXISTS rest;

ALTER TABLE public.session_exercises ALTER COLUMN sets DROP DEFAULT;
ALTER TABLE public.session_exercises
  ALTER COLUMN sets TYPE integer USING NULLIF(sets,'')::integer;

ALTER TABLE public.session_exercises
  ADD COLUMN IF NOT EXISTS target_mode text,
  ADD COLUMN IF NOT EXISTS rpe integer,
  ADD COLUMN IF NOT EXISTS load_mode text,
  ADD COLUMN IF NOT EXISTS load_value numeric,
  ADD COLUMN IF NOT EXISTS rest_sec integer,
  ADD COLUMN IF NOT EXISTS distance_km numeric,
  ADD COLUMN IF NOT EXISTS duration_min numeric,
  ADD COLUMN IF NOT EXISTS pace text,
  ADD COLUMN IF NOT EXISTS hr_zone integer,
  ADD COLUMN IF NOT EXISTS tempo_text text,
  ADD COLUMN IF NOT EXISTS prescription jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='session_exercises' AND column_name='tempo'
  ) THEN
    UPDATE public.session_exercises SET tempo_text = tempo WHERE tempo_text IS NULL AND tempo IS NOT NULL;
    ALTER TABLE public.session_exercises DROP COLUMN tempo;
  END IF;
END $$;

ALTER TABLE public.session_exercises RENAME COLUMN tempo_text TO tempo;

ALTER TABLE public.session_exercises
  ADD CONSTRAINT session_exercises_target_mode_check
    CHECK (target_mode IS NULL OR target_mode = ANY (ARRAY['Distance','Time','Laps','Hold','Reps'])),
  ADD CONSTRAINT session_exercises_load_mode_check
    CHECK (load_mode IS NULL OR load_mode = ANY (ARRAY['kg','%1RM','bodyweight'])),
  ADD CONSTRAINT session_exercises_rpe_check
    CHECK (rpe IS NULL OR (rpe BETWEEN 1 AND 10)),
  ADD CONSTRAINT session_exercises_hr_zone_check
    CHECK (hr_zone IS NULL OR (hr_zone BETWEEN 1 AND 5));
