-- get_chores_history: Returns resolved chore_instances for the current ISO week
-- for the given member, ordered by completion time.
--
-- Rules:
--   - Only returns chores with status != 'pending'.
--   - Handles both weekly and daily chores.
--   - Timezone aligned to the family's configured timezone.
--
-- Callable via: supabase.rpc('get_chores_history', { p_member_id: X })

CREATE OR REPLACE FUNCTION public.get_chores_history(p_member_id BIGINT)
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
    instance_date    DATE,
    photo_url        TEXT,
    completed_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_timezone       TEXT;
    v_local_date     DATE;
    v_week_start     DATE;
BEGIN
    -- Fetch timezone for the family
    SELECT fs.timezone INTO v_timezone
    FROM public.family_settings fs
    JOIN public.members m ON m.family_id = fs.family_id
    WHERE m.id = p_member_id
    LIMIT 1;

    -- Get local date in family's timezone
    v_local_date := (timezone(COALESCE(v_timezone, 'UTC'), now()))::date;

    -- ISO week starts on Monday
    v_week_start := date_trunc('week', v_local_date)::DATE;

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
        ci.instance_date,
        ci.photo_url,
        ci.completed_at
    FROM public.chore_instances ci
    JOIN public.chores c ON c.id = ci.chore_id
    JOIN public.weekly_templates wt ON wt.id = c.template_id
    WHERE ci.member_id       = p_member_id
      AND ci.week_start_date = v_week_start
      AND ci.status         != 'pending'
      -- Only return daily chores from past days
      AND ci.instance_date   IS NOT NULL
      AND ci.instance_date   < v_local_date
    ORDER BY
        ci.instance_date DESC,
        ci.completed_at DESC,
        c.title;
END;
$$;
