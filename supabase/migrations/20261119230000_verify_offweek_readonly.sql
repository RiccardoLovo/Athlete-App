-- READ-ONLY. No INSERT/UPDATE/DELETE.
DO $$
DECLARE r record; v_client uuid := 'e19a5b39-fd53-4c1e-bace-cd9cacbcb01c';
BEGIN
  FOR r IN
    WITH b AS (
      SELECT bl.id, bl.name, bl.position, bl.weeks, bl.archived,
             p.name AS plan_name, p.start_date AS plan_start, p.status,
             COALESCE(SUM(prev.weeks) FILTER (
               WHERE prev.position < bl.position AND NOT prev.archived), 0) AS before_weeks
        FROM public.training_blocks bl
        JOIN public.training_plans p ON p.id = bl.plan_id
        LEFT JOIN public.training_blocks prev ON prev.plan_id = bl.plan_id
       WHERE p.athlete_id = v_client AND p.status = 'active'
       GROUP BY bl.id, bl.name, bl.position, bl.weeks, bl.archived,
                p.name, p.start_date, p.status
    )
    SELECT *, (SELECT count(*) FROM public.sessions s WHERE s.block_id = b.id) AS sessions
      FROM b ORDER BY position
  LOOP
    RAISE NOTICE '% pos % | % | %w | % | sessions=%',
      r.plan_name, r.position, rpad(r.name,14), r.weeks,
      CASE WHEN r.archived THEN 'archived, no dates'
           ELSE (r.plan_start + (r.before_weeks*7)::int)::text || ' -> ' ||
                (r.plan_start + (r.before_weeks*7)::int + (r.weeks*7-1))::text
                || CASE WHEN current_date BETWEEN
                          (r.plan_start + (r.before_weeks*7)::int)
                      AND (r.plan_start + (r.before_weeks*7)::int + (r.weeks*7-1))
                        THEN '  <== TODAY' ELSE '' END
      END, r.sessions;
  END LOOP;
END $$;
