-- get_today_chores: Returns all chore_instances for the current ISO week (Mon–Sun)
-- for the given member, enriched with chore metadata (title, description, extra_reward, etc.).
-- Ordered: pending first, then done, then cancelled/failed; regular before backlog; alpha by title.
-- Callable via: supabase.rpc('get_today_chores', { p_member_id: X })

CREATE OR REPLACE FUNCTION public.get_today_chores(p_member_id BIGINT)
RETURNS TABLE (
    instance_id     BIGINT,
    chore_id        BIGINT,
    title           TEXT,
    description     TEXT,
    is_backlog      BOOLEAN,
    extra_reward    INT,
    status          TEXT,
    notes           TEXT,
    week_start_date DATE
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
        ci.week_start_date
    FROM public.chore_instances ci
    JOIN public.chores c ON c.id = ci.chore_id
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
