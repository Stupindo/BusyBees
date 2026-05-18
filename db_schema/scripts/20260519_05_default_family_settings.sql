-- 1. Insert default settings for existing families
INSERT INTO public.family_settings (family_id)
SELECT id FROM public.families f
WHERE NOT EXISTS (
  SELECT 1 FROM public.family_settings fs WHERE fs.family_id = f.id
);

-- 2. Update create_family function to insert default settings for new families
CREATE OR REPLACE FUNCTION public.create_family(p_name TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_family_id BIGINT;
  v_dummy_member_id BIGINT;
BEGIN
  -- Validate input
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Family name cannot be empty.';
  END IF;

  -- 1. Insert the family
  INSERT INTO public.families (name, created_by)
  VALUES (trim(p_name), auth.uid())
  RETURNING id INTO v_family_id;

  -- 2. Insert default settings
  INSERT INTO public.family_settings (family_id)
  VALUES (v_family_id);

  -- 3. Find if the user has a dummy record
  SELECT id INTO v_dummy_member_id 
  FROM public.members 
  WHERE user_id = auth.uid() AND family_id IS NULL
  LIMIT 1;

  IF v_dummy_member_id IS NOT NULL THEN
    -- Update their dummy record to point to the new family as admin
    UPDATE public.members 
    SET family_id = v_family_id,
        role = 'parent',
        is_admin = TRUE
    WHERE id = v_dummy_member_id;
  ELSE
    -- If no dummy record, insert a new one
    INSERT INTO public.members (user_id, family_id, role, is_admin)
    VALUES (auth.uid(), v_family_id, 'parent', TRUE);
  END IF;

  RETURN v_family_id;
END;
$$;
