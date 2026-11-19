-- READ-ONLY verification of the restructure. No INSERT/UPDATE/DELETE.
DO $$
DECLARE r record; v_client uuid := 'e19a5b39-fd53-4c1e-bace-cd9cacbcb01c';
BEGIN
  RAISE NOTICE '=== PLANS ===';
  FOR r IN SELECT p.id, p.name, p.start_date, p.status,
                  public.plan_end_date(p.id) AS ends
             FROM public.training_plans p WHERE p.athlete_id = v_client
            ORDER BY p.start_date LOOP
    RAISE NOTICE '% | start % | end % | %', rpad(r.name,8), r.start_date, r.ends, r.status;
  END LOOP;

  RAISE NOTICE '=== BLOCKS, with derived dates (archived skipped) ===';
  FOR r IN
    WITH b AS (
      SELECT bl.*, p.name AS plan_name, p.start_date AS plan_start,
             COALESCE(SUM(prev.weeks) FILTER (
               WHERE prev.position < bl.position AND NOT prev.archived), 0) AS before_weeks
        FROM public.training_blocks bl
        JOIN public.training_plans p ON p.id = bl.plan_id
        LEFT JOIN public.training_blocks prev ON prev.plan_id = bl.plan_id
       WHERE p.athlete_id = v_client
       GROUP BY bl.id, bl.name, bl.position, bl.weeks, bl.archived, bl.plan_id,
                p.name, p.start_date
    )
    SELECT plan_name, position, name, weeks, archived, plan_start, before_weeks,
           (SELECT count(*) FROM public.sessions s WHERE s.block_id = b.id) AS sessions,
           (SELECT count(*) FROM public.sessions s
              JOIN public.workout_logs wl ON wl.session_id = s.id
             WHERE s.block_id = b.id) AS logs
      FROM b ORDER BY plan_start, position
  LOOP
    RAISE NOTICE '% | pos % | % | %w | archived=% | % | sessions=% logs=%',
      rpad(r.plan_name,8), r.position, rpad(r.name,12), r.weeks, r.archived,
      CASE WHEN r.archived THEN 'no dates'
           ELSE (r.plan_start + (r.before_weeks*7)::int)::text || ' -> ' ||
                (r.plan_start + (r.before_weeks*7)::int + (r.weeks*7-1))::text END,
      r.sessions, r.logs;
  END LOOP;

  RAISE NOTICE '=== ADHERENCE / LOG COUNTS ===';
  SELECT adherence_from INTO r FROM public.clients WHERE id = v_client;
  RAISE NOTICE 'adherence_from = %', r.adherence_from;
  FOR r IN SELECT status, count(*) n FROM public.workout_logs
            WHERE client_id = v_client GROUP BY status ORDER BY status LOOP
    RAISE NOTICE 'logs % = %', rpad(r.status,10), r.n;
  END LOOP;
END $$;
