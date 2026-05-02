-- get_family_templates: Returns all weekly templates for a given family,
-- joined with member display info (name, role, is_admin) from auth.users metadata.
-- Callable via supabase.rpc('get_family_templates', { p_family_id: X })
-- Access is restricted: caller must be a member of the same family (enforced via RLS on weekly_templates).

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
