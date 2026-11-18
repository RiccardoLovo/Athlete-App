-- Two more athlete thresholds, so a zone can be rendered as something the
-- athlete can actually hold.
--
-- 'run_threshold_pace_sec_per_km': the fastest average pace sustainable for
--   about an hour, stored in seconds per km ("4:31" -> 271). Running's
--   equivalent of FTP, and what turns Z4 into a pace range.
--
-- 'bike_speed_kmh': typical riding speed, used only to estimate the
--   distance of a time-prescribed ride. It is the least reliable number in
--   the system — wind and gradient move it far more than they move run
--   pace — so anything derived from it is shown as an estimate.
--
-- Same dated-test shape as the existing metrics: a threshold is a
-- measurement taken on a day, not a property of a person, and a stale one
-- produces confidently wrong paces.

ALTER TABLE public.client_threshold_tests
  DROP CONSTRAINT IF EXISTS client_threshold_tests_metric_check;

ALTER TABLE public.client_threshold_tests
  ADD CONSTRAINT client_threshold_tests_metric_check
  CHECK (metric IN (
    'ftp_watts',
    'css_pace_sec_per_100m',
    'run_threshold_pace_sec_per_km',
    'bike_speed_kmh'
  ));
