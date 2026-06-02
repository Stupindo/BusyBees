CREATE OR REPLACE FUNCTION public.update_member_profile(
    p_member_id BIGINT,
    p_custom_name TEXT,
    p_avatar TEXT,
    p_role TEXT,
    p_is_admin BOOLEAN
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_member_id BIGINT;
    v_caller_family_id BIGINT;
    v_caller_role TEXT;
    v_caller_is_admin BOOLEAN;
    
    v_target_family_id BIGINT;
    v_target_role TEXT;
    v_target_is_admin BOOLEAN;
BEGIN
    -- 1. Get the caller's details
    SELECT id, family_id, role, is_admin 
    INTO v_caller_member_id, v_caller_family_id, v_caller_role, v_caller_is_admin
    FROM public.members
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_caller_member_id IS NULL THEN
        RETURN json_build_object('error', 'Unauthorized: You are not a member of any family.');
    END IF;

    -- 2. Get the target member's details
    SELECT family_id, role, is_admin
    INTO v_target_family_id, v_target_role, v_target_is_admin
    FROM public.members
    WHERE id = p_member_id;

    IF v_target_family_id IS NULL THEN
        RETURN json_build_object('error', 'Target member not found.');
    END IF;

    -- 3. Verify caller and target belong to the same family
    IF v_caller_family_id IS DISTINCT FROM v_target_family_id THEN
        RETURN json_build_object('error', 'Unauthorized: Member belongs to a different family.');
    END IF;

    -- 4. Check permissions and perform update
    -- Parents or Admins can modify everything
    IF (v_caller_role = 'parent' OR v_caller_is_admin = true) THEN
        UPDATE public.members
        SET 
            custom_name = p_custom_name,
            avatar = p_avatar,
            role = p_role,
            is_admin = p_is_admin
        WHERE id = p_member_id;
        
        RETURN json_build_object('success', true);
    ELSE
        -- Standard/Child member
        -- They can ONLY update their own profile
        IF v_caller_member_id IS DISTINCT FROM p_member_id THEN
            RETURN json_build_object('error', 'Unauthorized: Children can only update their own profile.');
        END IF;

        -- They CANNOT change role or is_admin
        IF p_role IS DISTINCT FROM v_target_role OR p_is_admin IS DISTINCT FROM v_target_is_admin THEN
            RETURN json_build_object('error', 'Unauthorized: Children cannot modify roles or admin privileges.');
        END IF;

        -- Update ONLY the allowed columns: custom_name and avatar
        UPDATE public.members
        SET 
            custom_name = p_custom_name,
            avatar = p_avatar
        WHERE id = p_member_id;

        RETURN json_build_object('success', true);
    END IF;
END;
$$;
