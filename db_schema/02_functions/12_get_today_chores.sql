-- get_today_chores: Returns chore_instances for the current ISO week (Mon–Sun)
-- for the given member, enriched with chore metadata.
--
-- Rules:
--   - Weekly chores (frequency = 'weekly'): all instances for the week are returned
--     (instance_date IS NULL).
--   - Daily chores (frequency = 'daily'): only the instance for TODAY is returned
--     (instance_date = CURRENT_DATE).
--
-- penalty_per_task per row resolves as COALESCE(c.penalty_per_task, wt.penalty_per_task):
--   chore-level override wins; falls back to the template-level global.
--
-- Ordered: pending first, then done, then cancelled/failed; regular before backlog; alpha by title.
-- Callable via: supabase.rpc('get_today_chores', { p_member_id: X })

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
    penalty_per_task INT,
    frequency        TEXT,
    recurrence_days  INT[],
    instance_date    DATE
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
        -- Chore-level override wins; falls back to template global
        COALESCE(c.penalty_per_task, wt.penalty_per_task) AS penalty_per_task,
        c.frequency,
        c.recurrence_days,
        ci.instance_date
    FROM public.chore_instances ci
    JOIN public.chores c ON c.id = ci.chore_id
    JOIN public.weekly_templates wt ON wt.id = c.template_id
    WHERE ci.member_id       = p_member_id
      AND ci.week_start_date = v_week_start
      -- Weekly chores: no date filter (instance_date IS NULL)
      -- Daily chores: only today's instance
      AND (
          c.frequency = 'weekly'
          OR (c.frequency = 'daily' AND ci.instance_date = CURRENT_DATE)
      )
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
