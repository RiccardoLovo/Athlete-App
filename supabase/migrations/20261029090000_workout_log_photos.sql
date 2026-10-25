-- Let athletes attach photos (e.g. a Strava/Garmin post-workout summary
-- screenshot) to a logged workout, visible to their coach. Reuses the
-- existing client_attachments table/client-attachments bucket rather than
-- a new one — its RLS already lets both the coach and the athlete manage
-- files scoped to that client, which is exactly what's needed here too.
-- A nullable workout_log_id just scopes a subset of those attachments to
-- one specific workout; existing general client attachments are
-- unaffected (workout_log_id stays null for those).
ALTER TABLE public.client_attachments
  ADD COLUMN workout_log_id uuid REFERENCES public.workout_logs(id) ON DELETE CASCADE;

CREATE INDEX idx_client_attachments_workout_log_id
  ON public.client_attachments(workout_log_id) WHERE workout_log_id IS NOT NULL;
