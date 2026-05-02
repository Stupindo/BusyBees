-- generate_week_chores: Merge function for the current ISO week.
--
-- Strategy:
--   a) INSERT 'pending' chore_instances for any template chore that doesn't
--      yet have an instance this week (for the given member).
--   b) UPDATE status to 'cancelled' for any 'pending' instance this week
--      whose chore is no longer part of the member's active template.
--
-- Returns JSON: { "inserted": N, "cancelled": N }
-- Callable via: supabase.rpc('generate_week_chores', { p_family_id: X, p_member_id: Y })

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
          AND is_backlog = false
          AND is_deleted = false
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
      AND (c.template_id != v_template_id OR c.is_backlog = true OR c.is_deleted = true);

    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    RETURN json_build_object('inserted', v_inserted, 'cancelled', v_cancelled);
END;
$$;
