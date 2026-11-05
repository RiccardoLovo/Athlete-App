-- Schema for the annotated exercise bank, which exists to make live exercise
-- swapping possible: an athlete mid-session says WHY they need a different
-- exercise and the engine answers with substitutes that hold the training
-- quality constant.
--
-- Design notes:
--  * Annotation lives in its own table rather than 30 nullable columns on
--    `exercises`. Most exercises will never be annotated, and the existing 84
--    rows must keep working untouched.
--  * `exercises.bank_id` is the stable key the importer joins on, so the JSON
--    under data/exercise-bank/ stays the single source of truth and a re-import
--    after a workbook edit is idempotent rather than duplicating rows.
--  * The contraindication rule is enforced by a trigger, not only by the audit
--    script. The script guards the files; the trigger guards the database no
--    matter how a row arrives.

-- ---------------------------------------------------------------- bank key
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS bank_id text;

CREATE UNIQUE INDEX IF NOT EXISTS exercises_bank_id_uidx
  ON public.exercises (bank_id) WHERE bank_id IS NOT NULL;

-- ------------------------------------------------------------- annotations
CREATE TABLE IF NOT EXISTS public.exercise_annotations (
  exercise_id uuid PRIMARY KEY REFERENCES public.exercises(id) ON DELETE CASCADE,
  block text NOT NULL,
  family text NOT NULL,
  modifiers text[] NOT NULL DEFAULT '{}',

  movement_pattern text NOT NULL,
  plane text NOT NULL CHECK (plane IN ('sagittal','frontal','transverse')),
  stance text NOT NULL CHECK (stance IN (
    'bilateral','unilateral','unilateral (split)','unilateral alternating')),
  per_side boolean NOT NULL DEFAULT false,

  -- Stretch-shortening cycle. 'n/a' covers grinding and isolation work where
  -- the SSC is not the organizing variable; the fast/slow divide is ground
  -- contact either side of roughly 250 ms.
  ssc text NOT NULL CHECK (ssc IN ('none','slow','fast','ecc','n/a')),
  ground_contact text,
  velocity text,

  joint_actions text[] NOT NULL DEFAULT '{}',
  agonists text[] NOT NULL DEFAULT '{}',
  synergists text[] NOT NULL DEFAULT '{}',
  stabilizers text[] NOT NULL DEFAULT '{}',

  -- Why two exercises sharing a muscle list are not interchangeable: joint
  -- position sets the length of the biarticular muscles.
  position_note text NOT NULL,
  resistance_note text,
  length_bias text CHECK (length_bias IN ('lengthened','mid','shortened')),

  admissible_intents text[] NOT NULL DEFAULT '{}',
  dose_window text NOT NULL,

  -- Eight tissue-stress fields. Three are spinal because a good morning, a
  -- back squat and a depth jump punish a bad back by different mechanisms:
  -- a flexion moment, axial compression, and landing impact respectively.
  stress_axial     text NOT NULL CHECK (stress_axial     IN ('low','mod','high')),
  stress_flexion   text NOT NULL CHECK (stress_flexion   IN ('low','mod','high')),
  stress_impact    text NOT NULL CHECK (stress_impact    IN ('low','mod','high')),
  stress_landing   text NOT NULL CHECK (stress_landing   IN ('low','mod','high')),
  stress_achilles  text NOT NULL CHECK (stress_achilles  IN ('low','mod','high')),
  stress_knee      text NOT NULL CHECK (stress_knee      IN ('low','mod','high')),
  stress_shoulder  text NOT NULL CHECK (stress_shoulder  IN ('low','mod','high')),
  stress_elbow     text NOT NULL CHECK (stress_elbow     IN ('low','mod','high')),

  equipment text[] NOT NULL DEFAULT '{}',
  -- Ranked by reach, not item count: a leg curl machine and a Nordic curl
  -- both list one item but one is a gym and the other needs a partner.
  equip_tier text NOT NULL CHECK (equip_tier IN ('none','home','minimal','gym','specialist')),
  space_required text,
  skill_level text NOT NULL CHECK (skill_level IN ('entry','intermediate','advanced')),
  cues text[] NOT NULL DEFAULT '{}',

  video_source text,
  video_verified_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exercise_annotations_pattern_idx
  ON public.exercise_annotations (movement_pattern);
CREATE INDEX IF NOT EXISTS exercise_annotations_block_idx
  ON public.exercise_annotations (block);
CREATE INDEX IF NOT EXISTS exercise_annotations_tier_idx
  ON public.exercise_annotations (equip_tier);

-- ------------------------------------------------------------- swap edges
CREATE TABLE IF NOT EXISTS public.exercise_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  to_exercise_id   uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN (
    'equipment','space','harder','lumbar','knee','achilles','shoulder','elbow')),
  -- What is held constant and what changes, in the words shown to the athlete.
  same_text text NOT NULL,
  changed_text text NOT NULL,
  -- Sets and reps usually carry over; the load expression often cannot.
  dose_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_swaps_not_self CHECK (from_exercise_id <> to_exercise_id),
  CONSTRAINT exercise_swaps_unique UNIQUE (from_exercise_id, to_exercise_id, reason)
);

CREATE INDEX IF NOT EXISTS exercise_swaps_from_reason_idx
  ON public.exercise_swaps (from_exercise_id, reason);

-- ------------------------------------------------------------------ flags
-- Provenance. Some annotation is cited and some is reasoning; they must not
-- read with identical authority.
CREATE TABLE IF NOT EXISTS public.exercise_annotation_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  field text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sourced','inferred','unverified')),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_annotation_flags_unique UNIQUE (exercise_id, field, kind)
);

-- ------------------------------------------------- the safety invariant
-- A substitute offered for an injury must not raise load on the tissue it is
-- offered to protect. The audit script enforces this over the JSON files; this
-- trigger enforces it over the database, so an import bug, a manual INSERT or
-- a future admin screen cannot get around it.
CREATE OR REPLACE FUNCTION public.check_exercise_swap_safety()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tissue_fields text[];
  f text;
  rank_from int;
  rank_to int;
  a public.exercise_annotations;
  b public.exercise_annotations;
  improved boolean := false;
BEGIN
  tissue_fields := CASE NEW.reason
    WHEN 'lumbar'   THEN ARRAY['stress_axial','stress_flexion','stress_impact']
    WHEN 'knee'     THEN ARRAY['stress_knee']
    WHEN 'achilles' THEN ARRAY['stress_achilles']
    WHEN 'shoulder' THEN ARRAY['stress_shoulder']
    WHEN 'elbow'    THEN ARRAY['stress_elbow']
    ELSE NULL
  END;

  -- equipment / space / harder carry no tissue claim.
  IF tissue_fields IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO a FROM public.exercise_annotations WHERE exercise_id = NEW.from_exercise_id;
  SELECT * INTO b FROM public.exercise_annotations WHERE exercise_id = NEW.to_exercise_id;

  -- An un-annotated exercise has no stress profile to reason about, so an
  -- injury-reason swap cannot be justified at all.
  IF a IS NULL OR b IS NULL THEN
    RAISE EXCEPTION
      'swap % -> % for reason "%" needs both exercises annotated before an injury claim can be checked',
      NEW.from_exercise_id, NEW.to_exercise_id, NEW.reason;
  END IF;

  FOREACH f IN ARRAY tissue_fields LOOP
    EXECUTE format('SELECT CASE ($1).%I WHEN ''low'' THEN 0 WHEN ''mod'' THEN 1 ELSE 2 END', f)
      INTO rank_from USING a;
    EXECUTE format('SELECT CASE ($1).%I WHEN ''low'' THEN 0 WHEN ''mod'' THEN 1 ELSE 2 END', f)
      INTO rank_to USING b;
    IF rank_to > rank_from THEN
      RAISE EXCEPTION
        'unsafe swap: % -> % offered for "%" raises % (% -> %). A substitute offered for an injury must not increase load on that tissue.',
        NEW.from_exercise_id, NEW.to_exercise_id, NEW.reason, f,
        (CASE rank_from WHEN 0 THEN 'low' WHEN 1 THEN 'mod' ELSE 'high' END),
        (CASE rank_to   WHEN 0 THEN 'low' WHEN 1 THEN 'mod' ELSE 'high' END);
    END IF;
    IF rank_to < rank_from THEN
      improved := true;
    END IF;
  END LOOP;

  IF NOT improved THEN
    RAISE WARNING
      'swap % -> % for "%" lowers nothing on %; it may not be worth offering',
      NEW.from_exercise_id, NEW.to_exercise_id, NEW.reason, tissue_fields;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exercise_swaps_safety ON public.exercise_swaps;
CREATE TRIGGER exercise_swaps_safety
  BEFORE INSERT OR UPDATE ON public.exercise_swaps
  FOR EACH ROW EXECUTE FUNCTION public.check_exercise_swap_safety();

-- -------------------------------------------------------------------- RLS
-- Reference data: any signed-in user reads it, only an admin writes it.
-- Deliberately no joins to other tables in these policies — the recursive
-- policy inlining that cost ~1.1 s of query planning on workout_blocks came
-- from exactly that, and has_role is SECURITY DEFINER so it stays flat.
ALTER TABLE public.exercise_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_annotation_flags ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exercise_annotations','exercise_swaps','exercise_annotation_flags'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))',
      t || '_admin', t);
  END LOOP;
END $$;

-- updated_at upkeep
CREATE OR REPLACE FUNCTION public.touch_exercise_annotation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS exercise_annotations_touch ON public.exercise_annotations;
CREATE TRIGGER exercise_annotations_touch
  BEFORE UPDATE ON public.exercise_annotations
  FOR EACH ROW EXECUTE FUNCTION public.touch_exercise_annotation();
