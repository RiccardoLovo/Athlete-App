-- Replace the catch-all "Sport-Specific" discipline with concrete sports.
--
-- Sport-Specific carried the actual sport in a free-text `sport_tag` column,
-- which meant the sport was neither filterable nor consistently spelled.
-- Football and Padel become first-class disciplines instead.
--
-- No global seed exercises used Sport-Specific, but coach-created rows might,
-- so reassign any stragglers before swapping the constraint — otherwise adding
-- the new CHECK would fail on a live database.

UPDATE public.exercises
  SET discipline = 'Padel'
  WHERE discipline = 'Sport-Specific'
    AND sport_tag ILIKE '%padel%';

UPDATE public.exercises
  SET discipline = 'Football'
  WHERE discipline = 'Sport-Specific';

ALTER TABLE public.exercises
  DROP CONSTRAINT IF EXISTS exercises_discipline_check;

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_discipline_check
  CHECK (discipline IN ('Strength','Running','Swimming','Cycling','Football','Padel','Mobility'));

-- `sport_tag` is intentionally left in place: it is now unused by the app but
-- dropping it would discard whatever the reassigned rows had recorded.
