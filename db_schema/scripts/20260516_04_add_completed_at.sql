ALTER TABLE public.chore_instances
ADD COLUMN completed_at TIMESTAMPTZ DEFAULT NULL;
