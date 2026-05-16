-- RPC to fetch family members including their login information (email, names) from auth.users
CREATE OR REPLACE FUNCTION public.get_family_members(p_family_id BIGINT)
RETURNS TABLE (
    id BIGINT,
    user_id UUID,
    family_id BIGINT,
    role TEXT,
    is_admin BOOLEAN,
    custom_name TEXT,
    avatar TEXT,
    email VARCHAR,
    first_name TEXT,
    full_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    -- Check if the current user is a member of the requested family
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
            m.avatar,
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
