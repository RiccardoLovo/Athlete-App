-- Extra sessions (is_client_added=true) are now logged as simple metadata
-- entries — discipline, zone-based intensity, and duration — rather than
-- built from exercises. These columns stay null for coach-authored sessions.

ALTER TABLE public.sessions
  ADD COLUMN discipline text,
  ADD COLUMN intensity text,
  ADD COLUMN duration_minutes integer;
