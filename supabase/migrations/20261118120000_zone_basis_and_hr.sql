-- A zone is meaningless without saying what it is measured against. Pace
-- Z2 and heart-rate Z2 are different instructions: heart rate lags the
-- effort, drifts upward through a long session, and climbs in heat on a
-- day the pace has not changed at all. A coach who means "hold this by
-- feel of effort" and a coach who means "keep the watch under 147" are
-- prescribing different sessions, and until now the block could not tell
-- them apart.
--
-- zone_basis says which. 'pace' covers pace and power — the lactate-
-- threshold family, where the zone is a speed or a wattage. 'hr' means
-- the zone is a heart-rate band.
--
-- Existing rows become 'pace', which is what every one of them already
-- meant: the zones in use were all paired with paces and %FTP.

ALTER TABLE public.workout_blocks
  ADD COLUMN IF NOT EXISTS zone_basis text NOT NULL DEFAULT 'pace';

ALTER TABLE public.workout_blocks
  DROP CONSTRAINT IF EXISTS workout_blocks_zone_basis_check;

ALTER TABLE public.workout_blocks
  ADD CONSTRAINT workout_blocks_zone_basis_check
  CHECK (zone_basis IN ('pace', 'hr'));

COMMENT ON COLUMN public.workout_blocks.zone_basis IS
  'What this block''s zone is measured against: ''pace'' (pace or power, '
  'the lactate-threshold family) or ''hr'' (a heart-rate band).';

-- Heart-rate zones need a reference of their own. Threshold heart rate is
-- preferred where it exists — it is measured the same way the pace and
-- power thresholds are, and the zones around it behave consistently.
-- Maximum heart rate is the fallback, since far more athletes know it.
ALTER TABLE public.client_threshold_tests
  DROP CONSTRAINT IF EXISTS client_threshold_tests_metric_check;

ALTER TABLE public.client_threshold_tests
  ADD CONSTRAINT client_threshold_tests_metric_check
  CHECK (metric IN (
    'ftp_watts',
    'css_pace_sec_per_100m',
    'run_threshold_pace_sec_per_km',
    'bike_speed_kmh',
    'lthr_bpm',
    'max_hr_bpm'
  ));
