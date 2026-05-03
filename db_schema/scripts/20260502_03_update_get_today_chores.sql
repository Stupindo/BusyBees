-- Update get_today_chores to return penalty_per_task from weekly_templates
-- This allows the dashboard to display the regular chore value (in gems)

CREATE OR REPLACE FUNCTION public.get_today_chores(p_member_id BIGINT)
RETURNS TABLE (
    instance_id      BIGINT,
    chore_id         BIGINT,
    title            TEXT,
    description      TEXT,
    is_backlog       BOOLEAN,
    extra_reward     INT,
    status           TEXT,
    notes            TEXT,
    week_start_date  DATE,
    penalty_per_task INT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_week_start DATE;
BEGIN
    -- ISO week starts on Monday
    v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

    RETURN QUERY
    SELECT
        ci.id               AS instance_id,
        ci.chore_id,
        c.title,
        c.description,
        c.is_backlog,
        c.extra_reward,
        ci.status,
        ci.notes,
        ci.week_start_date,
        wt.penalty_per_task
    FROM public.chore_instances ci
    JOIN public.chores c ON c.id = ci.chore_id
    JOIN public.weekly_templates wt ON wt.id = c.template_id
    WHERE ci.member_id      = p_member_id
      AND ci.week_start_date = v_week_start
    ORDER BY
        CASE ci.status
            WHEN 'pending'   THEN 1
            WHEN 'done'      THEN 2
            WHEN 'cancelled' THEN 3
            WHEN 'failed'    THEN 4
            ELSE 5
        END,
        c.is_backlog,
        c.title;
END;
$$;
