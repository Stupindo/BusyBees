CREATE TABLE public.chore_instances (
    id BIGSERIAL PRIMARY KEY,
    chore_id BIGINT REFERENCES public.chores(id) ON DELETE CASCADE,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'done', 'failed')),
    week_start_date DATE,
    notes TEXT,
    instance_date DATE DEFAULT NULL -- NULL for weekly chores; specific date for daily chore instances
);
