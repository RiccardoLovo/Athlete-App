-- Fixes a serious bug in suggest_exercise_swaps: the tissue-stress levels were
-- compared as text, and alphabetically 'high' < 'low' < 'mod'. The function
-- therefore believed a move from low to high stress was an improvement, and
-- offered a loaded Back Squat Jump as a lower-back-friendly substitute for a
-- bodyweight jump.
--
-- The exercise_swaps trigger did not catch it because that guards stored
-- edges; these candidates are computed at query time and never become rows.
-- So severity now goes through one ranking function used by both.

CREATE OR REPLACE FUNCTION public.stress_rank(_level text)
RETURNS int LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE _level WHEN 'low' THEN 0 WHEN 'mod' THEN 1 WHEN 'high' THEN 2 END;
$$;

COMMENT ON FUNCTION public.stress_rank IS
  'Orders a tissue-stress level by severity. Never compare these values as text: alphabetically high < low < mod.';

CREATE OR REPLACE FUNCTION public.suggest_exercise_swaps(
  _exercise_id uuid,
  _reason text
)
RETURNS TABLE (
  exercise_id uuid, name text, tier text,
  same_text text, changed_text text, dose_text text,
  video_url text, equip_tier text, skill_level text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH src AS (
  SELECT e.id, e.name_en, a.*
    FROM public.exercises e
    JOIN public.exercise_annotations a ON a.exercise_id = e.id
   WHERE e.id = _exercise_id
),
curated AS (
  SELECT t.id AS exercise_id, t.name_en AS name, 'curated'::text AS tier,
         s.same_text, s.changed_text, s.dose_text, t.video_url,
         ta.equip_tier, ta.skill_level
    FROM public.exercise_swaps s
    JOIN public.exercises t ON t.id = s.to_exercise_id
    JOIN public.exercise_annotations ta ON ta.exercise_id = t.id
   WHERE s.from_exercise_id = _exercise_id AND s.reason = _reason
),
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
    JOIN public.exercise_annotations ta ON ta.family = src.family AND ta.exercise_id <> src.id
    JOIN public.exercises t ON t.id = ta.exercise_id
   WHERE _reason IN ('equipment','space')
     AND array_position(ARRAY['none','home','minimal','gym','specialist'], ta.equip_tier)
       < array_position(ARRAY['none','home','minimal','gym','specialist'], src.equip_tier)
     AND t.id NOT IN (SELECT exercise_id FROM curated)
),
matched AS (
  SELECT t.id, t.name_en, 'matched on axes'::text,
         src.movement_pattern,
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
      ON ta.movement_pattern = src.movement_pattern AND ta.exercise_id <> src.id
    JOIN public.exercises t ON t.id = ta.exercise_id
   WHERE t.id NOT IN (SELECT exercise_id FROM curated)
     AND CASE _reason
       WHEN 'lumbar' THEN
            (stress_rank(ta.stress_axial)   < stress_rank(src.stress_axial)
          OR stress_rank(ta.stress_flexion) < stress_rank(src.stress_flexion)
          OR stress_rank(ta.stress_impact)  < stress_rank(src.stress_impact))
        AND stress_rank(ta.stress_axial)   <= stress_rank(src.stress_axial)
        AND stress_rank(ta.stress_flexion) <= stress_rank(src.stress_flexion)
        AND stress_rank(ta.stress_impact)  <= stress_rank(src.stress_impact)
       WHEN 'knee'     THEN stress_rank(ta.stress_knee)     < stress_rank(src.stress_knee)
       WHEN 'achilles' THEN stress_rank(ta.stress_achilles) < stress_rank(src.stress_achilles)
       WHEN 'shoulder' THEN stress_rank(ta.stress_shoulder) < stress_rank(src.stress_shoulder)
       WHEN 'elbow'    THEN stress_rank(ta.stress_elbow)    < stress_rank(src.stress_elbow)
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
