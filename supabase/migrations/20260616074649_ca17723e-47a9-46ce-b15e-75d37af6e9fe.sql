ALTER TABLE public.training_plans REPLICA IDENTITY FULL;
ALTER TABLE public.training_blocks REPLICA IDENTITY FULL;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.session_exercises REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_exercises;