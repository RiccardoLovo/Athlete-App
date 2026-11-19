-- "Run (repeat)" reads badly next to the block it repeats.
--
-- The athlete's week feed shows the current block and the ones still to
-- come, so for four days both Run blocks are on screen at once: "Run" and
-- "Run (repeat)". That is two names for what the athlete thinks of as the
-- first running block and the second one.
--
-- copy_block's default label is fine for a coach looking at a plan they
-- just duplicated. It is wrong for the athlete living in it.
UPDATE public.training_blocks
   SET name = 'Run 2'
 WHERE name = 'Run (repeat)'
   AND plan_id IN (
     SELECT id FROM public.training_plans
      WHERE athlete_id = 'e19a5b39-fd53-4c1e-bace-cd9cacbcb01c'
   );
