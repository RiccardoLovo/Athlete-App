ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_unique_slot;
CREATE INDEX IF NOT EXISTS sessions_block_week_day_idx ON public.sessions (block_id, week_number, day_of_week);