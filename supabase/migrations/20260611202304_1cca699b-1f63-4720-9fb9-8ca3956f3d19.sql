
-- 1. Clean slate: drop dependents' rows and the exercises table
TRUNCATE TABLE public.exercise_logs CASCADE;
TRUNCATE TABLE public.client_exercise_1rm CASCADE;
TRUNCATE TABLE public.session_exercises CASCADE;
TRUNCATE TABLE public.exercises CASCADE;

-- Drop old policies on exercises
DROP POLICY IF EXISTS "All authenticated read exercises" ON public.exercises;
DROP POLICY IF EXISTS "Coach exercises" ON public.exercises;

-- 2. Reshape the exercises table
ALTER TABLE public.exercises DROP COLUMN IF EXISTS coach_id;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS name;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS description;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS sport;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS movement_pattern;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS contraction_type;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS goal_tags;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS equipment;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS instructions;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS default_sets;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS default_reps;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS default_tempo;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS default_rest;
ALTER TABLE public.exercises DROP COLUMN IF EXISTS category_tags;
-- keep body_region column, but redefine its allowed values via CHECK below

ALTER TABLE public.exercises
  ADD COLUMN name_it text NOT NULL,
  ADD COLUMN name_en text NOT NULL,
  ADD COLUMN category text NOT NULL,
  ADD COLUMN discipline text NOT NULL,
  ADD COLUMN muscle_group text,
  ADD COLUMN stroke_default text,
  ADD COLUMN sport_tag text,
  ADD COLUMN description_it text,
  ADD COLUMN description_en text,
  ADD COLUMN video_url text,
  ADD COLUMN is_global boolean NOT NULL DEFAULT true,
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_category_check
  CHECK (category IN ('Resistance','Cardio','Mobility','Plyometric','Activation'));

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_discipline_check
  CHECK (discipline IN ('Strength','Running','Swimming','Cycling','Sport-Specific','Mobility'));

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_body_region_check
  CHECK (body_region IS NULL OR body_region IN ('Upper Body','Lower Body','Full Body','Core'));

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_stroke_check
  CHECK (stroke_default IS NULL OR stroke_default IN ('Freestyle','Backstroke','Breaststroke','Butterfly','IM'));

CREATE INDEX IF NOT EXISTS idx_exercises_discipline ON public.exercises(discipline);
CREATE INDEX IF NOT EXISTS idx_exercises_created_by ON public.exercises(created_by);

-- 3. RLS policies
CREATE POLICY "Read global or own exercises"
  ON public.exercises FOR SELECT
  TO authenticated
  USING (is_global = true OR created_by = auth.uid());

CREATE POLICY "Insert own custom exercises"
  ON public.exercises FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_global = false);

CREATE POLICY "Update own custom exercises"
  ON public.exercises FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() AND is_global = false)
  WITH CHECK (created_by = auth.uid() AND is_global = false);

CREATE POLICY "Delete own custom exercises"
  ON public.exercises FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() AND is_global = false);

-- 4. Seed 54 global exercises
-- STRENGTH (34)
INSERT INTO public.exercises (name_it, name_en, category, body_region, discipline, muscle_group, is_global) VALUES
('Squat con Bilanciere','Back Squat','Resistance','Lower Body','Strength','Quads, Glutes, Hamstrings',true),
('Box Squat','Box Squat','Resistance','Lower Body','Strength','Quads, Glutes',true),
('Squat Doppio Impulso con Jump','Double-Pulse Squat with Jump','Plyometric','Lower Body','Strength','Quads, Glutes',true),
('Box Squat Eccentrico Monopodalico','Single-Leg Eccentric Box Squat','Resistance','Lower Body','Strength','Quads, Glutes',true),
('Panca Piana','Bench Press','Resistance','Upper Body','Strength','Pecs, Triceps, Anterior Delts',true),
('Croci su Panca','Dumbbell Chest Flies','Resistance','Upper Body','Strength','Pecs',true),
('Trazioni','Pull-Ups','Resistance','Upper Body','Strength','Lats, Biceps',true),
('Pulley','Cable Row (Pulley)','Resistance','Upper Body','Strength','Lats, Rhomboids',true),
('Pull Down Isometrico ai Cavi','Isometric Cable Pull-Down','Resistance','Upper Body','Strength','Lats',true),
('Pull Frontale ai Cavi','Cable Front Pull','Resistance','Upper Body','Strength','Lats, Rear Delts',true),
('Rematore Alternato da Push-Up','Alternating Row from Push-Up','Resistance','Upper Body','Strength','Lats, Core',true),
('Military Press da Seduto','Seated Military Press','Resistance','Upper Body','Strength','Delts, Triceps',true),
('Tricipiti','Triceps Extensions','Resistance','Upper Body','Strength','Triceps',true),
('Tricipiti ai Cavi','Cable Triceps Extensions','Resistance','Upper Body','Strength','Triceps',true),
('Dip Zavorrato','Weighted Dips','Resistance','Upper Body','Strength','Pecs, Triceps',true),
('Bulgaro','Bulgarian Split Squat','Resistance','Lower Body','Strength','Quads, Glutes',true),
('Pressa','Leg Press','Resistance','Lower Body','Strength','Quads, Glutes',true),
('Leg Extension Isometrica','Leg Extension (Isometric Hold)','Resistance','Lower Body','Strength','Quads',true),
('Stacco Bipodalico','Bilateral Deadlift','Resistance','Lower Body','Strength','Hamstrings, Glutes, Lower Back',true),
('Step Up con Jump','Step-Up with Jump','Plyometric','Lower Body','Strength','Quads, Glutes',true),
('Slide Laterale','Lateral Slide','Resistance','Lower Body','Strength','Adductors',true),
('Copenhagen Plank','Copenhagen Plank','Resistance','Core','Strength','Adductors, Core',true),
('Isometria a Muro','Wall Sit','Resistance','Lower Body','Strength','Quads',true),
('Iso Push-Up con Jump','Isometric Push-Up with Jump','Plyometric','Upper Body','Strength','Pecs, Triceps',true),
('Rotazione al Cavo in Ginocchio','Kneeling Cable Rotation','Resistance','Core','Strength','Obliques, Core',true),
('Lancio Palla Medica dal Petto','Medicine Ball Chest Throw','Plyometric','Upper Body','Strength','Pecs, Triceps',true),
('Lancio Palla Medica Slam','Medicine Ball Slam','Plyometric','Full Body','Strength','Full Body',true),
('Addominali Isometrici','Isometric Abs Hold','Resistance','Core','Strength','Abs',true),
('Addominali Isometrici + Rotazioni','Isometric Abs + Med Ball Rotations','Resistance','Core','Strength','Abs, Obliques',true),
('Balzo Frontale Bipodalico','Bilateral Forward Jump','Plyometric','Lower Body','Strength','Quads, Glutes',true),
('Balzo Frontale Monopodalico','Single-Leg Forward Jump','Plyometric','Lower Body','Strength','Quads, Glutes',true),
('Balzo Laterale','Lateral Jump','Plyometric','Lower Body','Strength','Quads, Glutes, Adductors',true),
('Jump Monopodalico su Box','Single-Leg Box Jump','Plyometric','Lower Body','Strength','Quads, Glutes',true),
('Jump Laterale + Verticale','Single-Leg Lateral + Vertical Jump','Plyometric','Lower Body','Strength','Quads, Glutes',true);

-- RUNNING (8) — no body_region, no muscle_group
INSERT INTO public.exercises (name_it, name_en, category, discipline, is_global) VALUES
('Corsa Continua','Steady Run','Cardio','Running',true),
('Intervalli','Intervals','Cardio','Running',true),
('Fartlek','Fartlek','Cardio','Running',true),
('Corsa Piramidale','Pyramid Run','Cardio','Running',true),
('Sprint RSA','RSA Sprints','Cardio','Running',true),
('Navette con Sprint','Shuttle Runs with Sprints','Cardio','Running',true),
('Andature di Riscaldamento','Warm-Up Running Drills','Activation','Running',true),
('Corsa Complementare Zona 2','Zone 2 Complementary Run','Cardio','Running',true);

-- SWIMMING (4)
INSERT INTO public.exercises (name_it, name_en, category, discipline, stroke_default, is_global) VALUES
('Vasca Libera','Freestyle Laps','Cardio','Swimming','Freestyle',true),
('Set Piramidale Nuoto','Swimming Pyramid Set','Cardio','Swimming','Freestyle',true),
('Defaticante Posturale','Postural Cooldown','Mobility','Swimming',NULL,true),
('Defaticante Ciclico Zona 1','Zone 1 Cooldown','Cardio','Swimming',NULL,true);

-- MOBILITY (8)
INSERT INTO public.exercises (name_it, name_en, category, body_region, discipline, is_global) VALUES
('Riscaldamento Mobilità + Ciclette','Mobility Warm-Up + Bike Activation','Activation','Full Body','Mobility',true),
('Riscaldamento Mobilità + Remo','Mobility Warm-Up + Row','Activation','Full Body','Mobility',true),
('Attivazione Mobilità e Andature','Activation with Mobility Drills','Activation','Full Body','Mobility',true),
('Core Circuit 3 Minuti','3-Min Core Circuit (30s on/30s off)','Activation','Core','Mobility',true),
('Sprint di Prevenzione','Injury Prevention Sprints (5/10/15m)','Activation','Lower Body','Mobility',true),
('Stretching Dinamico','Dynamic Stretching','Mobility','Full Body','Mobility',true),
('Stretching Statico','Static Stretching','Mobility','Full Body','Mobility',true),
('90/90 Anca','Hip 90/90','Mobility','Lower Body','Mobility',true);
