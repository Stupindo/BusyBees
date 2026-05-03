-- Function to regenerate family join code
CREATE OR REPLACE FUNCTION public.regenerate_family_join_code(p_family_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  new_code TEXT;
  is_unique BOOLEAN := FALSE;
BEGIN
  -- Validate input
  IF p_family_id IS NULL THEN
    RAISE EXCEPTION 'Family ID cannot be null.';
  END IF;

  -- 1. Check if user is an admin or parent of this family
  SELECT (role = 'parent' OR is_admin = TRUE) INTO v_is_admin
  FROM public.members
  WHERE user_id = auth.uid() AND family_id = p_family_id;

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Only family admins or parents can regenerate the join code.';
  END IF;

  -- 2. Generate a new unique code
  WHILE NOT is_unique LOOP
    new_code := public.generate_random_code(6);
    IF NOT EXISTS (SELECT 1 FROM public.families WHERE join_code = new_code) THEN
      is_unique := TRUE;
    END IF;
  END LOOP;

  -- 3. Update the family
  UPDATE public.families
  SET join_code = new_code
  WHERE id = p_family_id;

  RETURN new_code;
END;
$$;
