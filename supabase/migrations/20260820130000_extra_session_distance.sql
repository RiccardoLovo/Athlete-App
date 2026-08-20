-- Optional distance for extra sessions (Running/Cycling in km, Swimming in
-- meters at the UI layer); stored in meters throughout so it's a single
-- comparable unit regardless of discipline.

ALTER TABLE public.sessions
  ADD COLUMN distance_meters numeric;
