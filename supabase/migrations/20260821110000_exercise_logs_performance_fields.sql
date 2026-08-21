-- Non-strength exercise logging (running/swimming/cycling intervals, etc.)
-- needs to record actual performed distance/duration/pace, not weight×reps.

ALTER TABLE public.exercise_logs
  ADD COLUMN distance_km numeric,
  ADD COLUMN duration_min numeric,
  ADD COLUMN pace text;
