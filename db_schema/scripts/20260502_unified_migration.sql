-- Migration script to implement soft deletes for chores and fix RPC functions
-- 1. Add is_deleted to chores table
ALTER TABLE public.chores ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 2. Fix get_family_members to use LEFT JOIN for auth.users
CREATE OR REPLACE FUNCTION public.get_family_members(p_family_id BIGINT)
RETURNS TABLE (
    id BIGINT,
    user_id UUID,
    family_id BIGINT,
    role TEXT,
    is_admin BOOLEAN,
    custom_name TEXT,
    email VARCHAR,
    first_name TEXT,
    full_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.members 
        WHERE public.members.family_id = p_family_id 
        AND public.members.user_id = auth.uid()
    ) THEN
        RETURN QUERY 
        SELECT 
            m.id, 
            m.user_id, 
            m.family_id, 
            m.role, 
            m.is_admin, 
            m.custom_name, 
            u.email::VARCHAR,
            (u.raw_user_meta_data->>'first_name')::TEXT as first_name,
            (u.raw_user_meta_data->>'full_name')::TEXT as full_name
        FROM public.members m
        LEFT JOIN auth.users u ON m.user_id = u.id
        WHERE m.family_id = p_family_id
        ORDER BY m.id ASC;
    ELSE
        RAISE EXCEPTION 'Not authorized to view members of this family';
    END IF;
END;
$$;

-- 3. Fix get_family_templates to use LEFT JOIN and count only active chores
CREATE OR REPLACE FUNCTION public.get_family_templates(p_family_id BIGINT)
RETURNS TABLE (
    template_id     BIGINT,
    member_id       BIGINT,
    total_reward    INT,
    penalty_per_task INT,
    member_role     TEXT,
    member_is_admin BOOLEAN,
    member_custom_name TEXT,
    member_email    TEXT,
    member_first_name TEXT,
    member_full_name  TEXT,
    chore_count     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wt.id                                       AS template_id,
        m.id                                        AS member_id,
        wt.total_reward,
        wt.penalty_per_task,
        m.role                                      AS member_role,
        m.is_admin                                  AS member_is_admin,
        m.custom_name                               AS member_custom_name,
        (u.raw_user_meta_data->>'email')::TEXT      AS member_email,
        (u.raw_user_meta_data->>'first_name')::TEXT AS member_first_name,
        (u.raw_user_meta_data->>'full_name')::TEXT  AS member_full_name,
        COUNT(c.id)                                 AS chore_count
    FROM public.weekly_templates wt
    JOIN public.members m ON m.id = wt.member_id
    LEFT JOIN auth.users u     ON u.id = m.user_id
    LEFT JOIN public.chores c ON c.template_id = wt.id AND c.is_deleted = false
    WHERE wt.family_id = p_family_id
    GROUP BY wt.id, m.id, u.raw_user_meta_data;
END;
$$;

-- 4. Fix generate_week_chores to implement soft deletes cancel logic
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

    SELECT id INTO v_template_id
    FROM public.weekly_templates
    WHERE family_id = p_family_id
      AND member_id = p_member_id
    LIMIT 1;

    IF v_template_id IS NULL THEN
        RETURN json_build_object('inserted', 0, 'cancelled', 0, 'error', 'No template found for this member');
    END IF;

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
