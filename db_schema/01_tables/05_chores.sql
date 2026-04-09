CREATE TABLE public.chores (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    template_id BIGINT REFERENCES public.weekly_templates(id) ON DELETE CASCADE,
    is_backlog BOOLEAN DEFAULT FALSE,
    extra_reward INT DEFAULT 0,
    description TEXT
);
