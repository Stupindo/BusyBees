CREATE TABLE public.weekly_templates (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    total_reward INT,
    penalty_per_task INT
);
