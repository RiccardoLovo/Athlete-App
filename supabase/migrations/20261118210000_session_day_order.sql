-- Two sessions on one day need an order, and there was none.
--
-- The schema once forbade a second session per day outright (a UNIQUE on
-- block_id, week_number, day_of_week, dropped in 20260612095237), and when
-- that lifted nothing took its place. Every query since has ordered by
-- day_of_week alone, so a swim and an evening run came back in whatever
-- order Postgres felt like returning them — which is stable enough to look
-- deliberate and arbitrary enough to flip after any update to either row.
--
-- A coach also cannot say "swim first, run after work" without it, and for
-- a two-a-day that ordering is the training instruction, not a preference:
-- quality before volume, or the quality session is wasted.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS day_order smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.sessions.day_order IS
  'Order within the day, 1 first. Ties broken by created_at.';

-- Preserve the order the days are currently being displayed in rather than
-- reshuffling anyone's week: created_at is what the existing arbitrary
-- order has in practice been following.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY block_id, week_number, day_of_week
           ORDER BY created_at, id
         ) AS n
  FROM public.sessions
)
UPDATE public.sessions s
SET day_order = ranked.n
FROM ranked
WHERE ranked.id = s.id
  AND s.day_order <> ranked.n;

-- Every read of a week filters on these three and now sorts on the fourth.
CREATE INDEX IF NOT EXISTS idx_sessions_block_week_day_order
  ON public.sessions (block_id, week_number, day_of_week, day_order);
