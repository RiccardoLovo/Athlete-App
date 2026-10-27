-- Autosave while an athlete is mid-workout used to DELETE every
-- exercise_log for the workout and then re-INSERT them. Those are two
-- separate round trips, so backgrounding the app in between (which iOS
-- does aggressively, and which also freezes any in-flight request) left
-- the workout with its sets deleted and nothing written back — the
-- athlete reopened the session and found every set and rep gone.
--
-- A unique key on (workout_log_id, session_exercise_id) lets the client
-- upsert each exercise in place instead, so there is no window in which
-- the athlete's logged work does not exist.

CREATE UNIQUE INDEX IF NOT EXISTS exercise_logs_log_session_ex_uidx
  ON public.exercise_logs (workout_log_id, session_exercise_id);
