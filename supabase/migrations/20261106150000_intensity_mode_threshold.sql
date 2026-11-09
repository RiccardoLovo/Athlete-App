-- Cycling and swimming are prescribed against a threshold percentage, not a
-- pace: %FTP for the bike, %CSS for the swim. "zone" and "pace" could not
-- express "follow the percentage", so the percentage was always indicative
-- even when it was the number the athlete was meant to hold.
ALTER TABLE public.workout_blocks
  DROP CONSTRAINT IF EXISTS workout_blocks_intensity_mode_check;
ALTER TABLE public.workout_blocks
  ADD CONSTRAINT workout_blocks_intensity_mode_check
  CHECK (intensity_mode IN ('zone','pace','threshold'));
