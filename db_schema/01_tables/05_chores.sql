CREATE TABLE public.chores (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    template_id BIGINT REFERENCES public.weekly_templates(id) ON DELETE CASCADE,
    is_backlog BOOLEAN DEFAULT FALSE,
    extra_reward INT DEFAULT 0,
    description TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'daily')),
    recurrence_days INT[] DEFAULT NULL -- NULL = all days; array of ISO weekday nums (1=Mon…7=Sun) for 'daily' chores
);
