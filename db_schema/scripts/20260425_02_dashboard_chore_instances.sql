-- =============================================================================
-- Migration: 20260425_dashboard_chore_instances
-- Description:
--   1. Extend chore_instances.status CHECK to allow 'cancelled'.
--   2. Create get_today_chores(p_member_id) – returns all chore instances for
--      the current week for a specific member, joined with chore details.
--   3. Create generate_week_chores(p_family_id, p_member_id) – merge function
--      that creates missing chore instances for the current week and cancels
--      instances whose chores were removed from the template.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add 'cancelled' to chore_instances.status CHECK constraint
-- -----------------------------------------------------------------------------

ALTER TABLE public.chore_instances
  DROP CONSTRAINT IF EXISTS chore_instances_status_check;

ALTER TABLE public.chore_instances
  ADD CONSTRAINT chore_instances_status_check
    CHECK (status IN ('pending', 'done', 'failed', 'cancelled'));


-- -----------------------------------------------------------------------------
-- 2. Function: get_today_chores(p_member_id BIGINT)
--
--    Returns all chore_instances for the current ISO week (Mon–Sun)
--    for the given member, enriched with chore metadata.
--    Callable via: supabase.rpc('get_today_chores', { p_member_id: X })
-- -----------------------------------------------------------------------------

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
        -- pending first, then done, then cancelled/failed
        CASE ci.status
            WHEN 'pending'   THEN 1
            WHEN 'done'      THEN 2
            WHEN 'cancelled' THEN 3
            WHEN 'failed'    THEN 4
            ELSE 5
        END,
        c.is_backlog,   -- regular chores before backlog
        c.title;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Function: generate_week_chores(p_family_id BIGINT, p_member_id BIGINT)
--
--    Merge strategy for the current ISO week:
--      a) For each chore in the member's weekly_template that does NOT yet
--         have a chore_instance this week → INSERT with status 'pending'.
--      b) For each chore_instance this week whose chore no longer belongs
--         to an active template for this member → UPDATE status to 'cancelled'
--         with a system note.
--
--    Returns the number of instances inserted and the number cancelled.
--    Callable via: supabase.rpc('generate_week_chores', { p_family_id, p_member_id })
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_week_chores(
    p_family_id  BIGINT,
    p_member_id  BIGINT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_week_start    DATE;
    v_inserted      INT := 0;
    v_cancelled     INT := 0;
    v_template_id   BIGINT;
BEGIN
    v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

    -- Resolve template for this member in this family
    SELECT id INTO v_template_id
    FROM public.weekly_templates
    WHERE family_id = p_family_id
      AND member_id = p_member_id
    LIMIT 1;

    IF v_template_id IS NULL THEN
        RETURN json_build_object('inserted', 0, 'cancelled', 0, 'error', 'No template found for this member');
    END IF;

    -- (a) Insert missing chore instances
    WITH template_chores AS (
        SELECT id AS chore_id
        FROM public.chores
        WHERE template_id = v_template_id
    ),
    existing_instances AS (
        SELECT chore_id
        FROM public.chore_instances
        WHERE member_id      = p_member_id
          AND week_start_date = v_week_start
    ),
    to_insert AS (
        SELECT tc.chore_id
        FROM template_chores tc
        LEFT JOIN existing_instances ei ON ei.chore_id = tc.chore_id
        WHERE ei.chore_id IS NULL
    )
    INSERT INTO public.chore_instances (chore_id, member_id, status, week_start_date, notes)
    SELECT chore_id, p_member_id, 'pending', v_week_start, NULL
    FROM to_insert;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- (b) Cancel instances whose chores are no longer in the template
    UPDATE public.chore_instances ci
    SET
        status = 'cancelled',
        notes  = COALESCE(ci.notes || E'\n', '') || '[System] Chore was removed from the weekly template.'
    FROM public.chores c
    WHERE ci.chore_id       = c.id
      AND ci.member_id      = p_member_id
      AND ci.week_start_date = v_week_start
      AND ci.status         = 'pending'
      AND c.template_id    != v_template_id;

    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    RETURN json_build_object('inserted', v_inserted, 'cancelled', v_cancelled);
END;
$$;
