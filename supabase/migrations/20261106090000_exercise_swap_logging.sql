-- Live exercise swapping.
--
-- A swap is recorded on the LOG, never on the prescription. session_exercises
-- is the coach's plan — shared, reused by Copy Week, and read by every future
-- athlete of that block. An athlete changing what they did today must not
-- rewrite it. So the prescription stays intact and the log says what actually
-- happened and why, which is also exactly what the coach needs at review.

ALTER TABLE public.exercise_logs
  ADD COLUMN IF NOT EXISTS swapped_to_exercise_id uuid
    REFERENCES public.exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS swap_reason text
    CHECK (swap_reason IN ('equipment','space','harder','lumbar','knee','achilles','shoulder','elbow')),
  ADD COLUMN IF NOT EXISTS swap_note text;

-- A reason without a substitute, or a substitute without a reason, is a
-- half-written swap the coach cannot interpret.
ALTER TABLE public.exercise_logs
  DROP CONSTRAINT IF EXISTS exercise_logs_swap_complete;
ALTER TABLE public.exercise_logs
  ADD CONSTRAINT exercise_logs_swap_complete CHECK (
    (swapped_to_exercise_id IS NULL AND swap_reason IS NULL)
    OR (swapped_to_exercise_id IS NOT NULL AND swap_reason IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS exercise_logs_swapped_idx
  ON public.exercise_logs (swapped_to_exercise_id)
  WHERE swapped_to_exercise_id IS NOT NULL;

-- ------------------------------------------------------------------ suggestions
-- Three tiers, weakest last:
--   curated       — an edge a coach wrote by hand, with its own explanation
--   same movement — the family structure answers it mechanically
--   matched       — pattern and stress matching, the fallback for the long tail
--
-- Returning nothing is a valid answer. An engine that always produces three
-- suggestions is wrong a third of the time.
CREATE OR REPLACE FUNCTION public.suggest_exercise_swaps(
  _exercise_id uuid,
  _reason text
)
RETURNS TABLE (
  exercise_id uuid,
  name text,
  tier text,
  same_text text,
  changed_text text,
  dose_text text,
  video_url text,
  equip_tier text,
  skill_level text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH src AS (
  SELECT e.id, e.name_en, a.*
    FROM public.exercises e
    JOIN public.exercise_annotations a ON a.exercise_id = e.id
   WHERE e.id = _exercise_id
),
-- Tier 1: hand-written knowledge.
curated AS (
  SELECT t.id AS exercise_id, t.name_en AS name, 'curated'::text AS tier,
         s.same_text, s.changed_text, s.dose_text, t.video_url,
         ta.equip_tier, ta.skill_level
    FROM public.exercise_swaps s
    JOIN public.exercises t ON t.id = s.to_exercise_id
    JOIN public.exercise_annotations ta ON ta.exercise_id = t.id
   WHERE s.from_exercise_id = _exercise_id
     AND s.reason = _reason
),
-- Tier 2: same movement family, but easier to reach. Only meaningful when the
-- obstacle is kit or space.
family AS (
  SELECT t.id, t.name_en, 'same movement'::text,
         'Same movement family (' || src.family || ')',
         CASE WHEN array_length(ta.equipment, 1) IS NULL
              THEN 'Needs no equipment'
              ELSE 'Needs ' || array_to_string(ta.equipment, ', ') END,
         CASE WHEN ta.per_side AND NOT src.per_side
              THEN 'Reps become per side'
              ELSE 'Check against its own dose window' END,
         t.video_url, ta.equip_tier, ta.skill_level
    FROM src
    JOIN public.exercise_annotations ta ON ta.family = src.family
                                       AND ta.exercise_id <> src.id
    JOIN public.exercises t ON t.id = ta.exercise_id
   WHERE _reason IN ('equipment','space')
     AND array_position(ARRAY['none','home','minimal','gym','specialist'], ta.equip_tier)
       < array_position(ARRAY['none','home','minimal','gym','specialist'], src.equip_tier)
     AND t.id NOT IN (SELECT exercise_id FROM curated)
),
-- Tier 3: same pattern, and genuinely better on whatever is being protected.
matched AS (
  SELECT t.id, t.name_en, 'matched on axes'::text,
         src.movement_pattern || CASE WHEN _reason IN ('equipment','space','harder')
           THEN ', ' || lower(src.ssc) || ' SSC' ELSE '' END,
         CASE _reason
           WHEN 'lumbar'   THEN 'spinal load ' || src.stress_axial || '/' || src.stress_flexion || '/' || src.stress_impact
                                || ' -> ' || ta.stress_axial || '/' || ta.stress_flexion || '/' || ta.stress_impact
           WHEN 'knee'     THEN 'knee ' || src.stress_knee || ' -> ' || ta.stress_knee
           WHEN 'achilles' THEN 'achilles ' || src.stress_achilles || ' -> ' || ta.stress_achilles
           WHEN 'shoulder' THEN 'shoulder ' || src.stress_shoulder || ' -> ' || ta.stress_shoulder
           WHEN 'elbow'    THEN 'elbow ' || src.stress_elbow || ' -> ' || ta.stress_elbow
           WHEN 'harder'   THEN 'skill ' || src.skill_level || ' -> ' || ta.skill_level
           ELSE 'equipment ' || src.equip_tier || ' -> ' || ta.equip_tier
         END,
         CASE WHEN ta.per_side AND NOT src.per_side
              THEN 'Reps become per side'
              ELSE 'Check against its own dose window' END,
         t.video_url, ta.equip_tier, ta.skill_level
    FROM src
    JOIN public.exercise_annotations ta
      ON ta.movement_pattern = src.movement_pattern
     AND ta.exercise_id <> src.id
    JOIN public.exercises t ON t.id = ta.exercise_id
   WHERE t.id NOT IN (SELECT exercise_id FROM curated)
     AND CASE _reason
       -- Strictly better on the protected tissue, and worse on none of it.
       WHEN 'lumbar' THEN
            (ta.stress_axial   < src.stress_axial
          OR ta.stress_flexion < src.stress_flexion
          OR ta.stress_impact  < src.stress_impact)
        AND ta.stress_axial   <= src.stress_axial
        AND ta.stress_flexion <= src.stress_flexion
        AND ta.stress_impact  <= src.stress_impact
       WHEN 'knee'     THEN ta.stress_knee     < src.stress_knee
       WHEN 'achilles' THEN ta.stress_achilles < src.stress_achilles
       WHEN 'shoulder' THEN ta.stress_shoulder < src.stress_shoulder
       WHEN 'elbow'    THEN ta.stress_elbow    < src.stress_elbow
       WHEN 'harder'   THEN
            array_position(ARRAY['entry','intermediate','advanced'], ta.skill_level)
          < array_position(ARRAY['entry','intermediate','advanced'], src.skill_level)
       WHEN 'equipment' THEN
            array_position(ARRAY['none','home','minimal','gym','specialist'], ta.equip_tier)
          < array_position(ARRAY['none','home','minimal','gym','specialist'], src.equip_tier)
       WHEN 'space' THEN
            array_position(ARRAY['none','home','minimal','gym','specialist'], ta.equip_tier)
         <= array_position(ARRAY['none','home','minimal','gym','specialist'], src.equip_tier)
       ELSE false
     END
)
SELECT * FROM curated
UNION ALL
SELECT * FROM family WHERE id NOT IN (SELECT exercise_id FROM curated)
UNION ALL
SELECT * FROM matched
  WHERE id NOT IN (SELECT exercise_id FROM curated)
    AND id NOT IN (SELECT id FROM family)
LIMIT 8;
$$;

COMMENT ON FUNCTION public.suggest_exercise_swaps IS
  'Substitutes for an exercise given why the athlete needs to change it. Returns nothing when nothing qualifies, which is a valid answer.';
