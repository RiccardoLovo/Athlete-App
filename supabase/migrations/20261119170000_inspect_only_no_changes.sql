-- READ-ONLY. This migration changes nothing.
--
-- There is no way to query the remote database from the working
-- environment: the CLI has no single-table dump and a whole-schema dump
-- is blocked, so the plan restructure was being described from the
-- outside instead of done. RAISE NOTICE comes back through `db push`,
-- which makes this the one honest way to read the rows before writing
-- UPDATEs against them.
--
-- It holds no INSERT, UPDATE or DELETE. Safe to re-run, and safe to
-- delete from the migrations folder afterwards.

DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '=== CLIENTS ===';
  FOR r IN
    SELECT c.id, c.name, c.user_id, c.coach_id, c.adherence_from
      FROM public.clients c ORDER BY c.name
  LOOP
    RAISE NOTICE 'client % | name=% | user=% | coach=% | adherence_from=%',
      r.id, r.name, r.user_id, r.coach_id, COALESCE(r.adherence_from::text,'(none)');
  END LOOP;

  RAISE NOTICE '=== ROLES (per user that owns a client row) ===';
  FOR r IN
    SELECT c.name, ur.user_id, string_agg(ur.role::text, ',') AS roles
      FROM public.clients c
      LEFT JOIN public.user_roles ur ON ur.user_id = c.user_id
     GROUP BY c.name, ur.user_id
  LOOP
    RAISE NOTICE 'athlete=% | user=% | roles=%',
      r.name, r.user_id, COALESCE(r.roles,'(none)');
  END LOOP;

  RAISE NOTICE '=== PLANS ===';
  FOR r IN
    SELECT p.id, p.name, p.start_date, p.status, c.name AS athlete
      FROM public.training_plans p
      JOIN public.clients c ON c.id = p.athlete_id
     ORDER BY c.name, p.start_date
  LOOP
    RAISE NOTICE 'plan % | % | start=% | status=% | athlete=%',
      r.id, r.name, r.start_date, r.status, r.athlete;
  END LOOP;

  RAISE NOTICE '=== BLOCKS (with session and log counts) ===';
  FOR r IN
    SELECT b.id, b.name, b.position, b.weeks, b.archived,
           p.name AS plan_name,
           (SELECT count(*) FROM public.sessions s WHERE s.block_id = b.id) AS sessions,
           (SELECT count(*) FROM public.sessions s
              JOIN public.workout_logs wl ON wl.session_id = s.id
             WHERE s.block_id = b.id) AS logs
      FROM public.training_blocks b
      JOIN public.training_plans p ON p.id = b.plan_id
     ORDER BY p.start_date, b.position
  LOOP
    RAISE NOTICE 'block % | pos=% | % | %w | archived=% | plan=% | sessions=% | logs=%',
      r.id, r.position, r.name, r.weeks, r.archived, r.plan_name, r.sessions, r.logs;
  END LOOP;

  RAISE NOTICE '=== WORKOUT LOG STATUS COUNTS ===';
  FOR r IN
    SELECT c.name AS athlete, wl.status, count(*) AS n
      FROM public.workout_logs wl
      JOIN public.clients c ON c.id = wl.client_id
     GROUP BY c.name, wl.status ORDER BY c.name, wl.status
  LOOP
    RAISE NOTICE 'athlete=% | status=% | count=%', r.athlete, r.status, r.n;
  END LOOP;
END $$;
