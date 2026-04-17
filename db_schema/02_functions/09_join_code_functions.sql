-- 1. Helper function to generate a random uppercase alphanumeric string
CREATE OR REPLACE FUNCTION public.generate_random_code(length INT)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INT := 0;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INT, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger function to auto-assign a 6-character join code on family creation
CREATE OR REPLACE FUNCTION public.assign_family_join_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  is_unique BOOLEAN := FALSE;
BEGIN
  -- Loop until we find a unique code just in case of collision
  WHILE NOT is_unique LOOP
    new_code := public.generate_random_code(6);
    IF NOT EXISTS (SELECT 1 FROM public.families WHERE join_code = new_code) THEN
      is_unique := TRUE;
    END IF;
  END LOOP;
  
  NEW.join_code := new_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_family_created_assign_code ON public.families;
CREATE TRIGGER on_family_created_assign_code
  BEFORE INSERT ON public.families
  FOR EACH ROW EXECUTE PROCEDURE public.assign_family_join_code();

-- 3. RPC for new members to join a family using the join code
CREATE OR REPLACE FUNCTION public.join_family_by_code(p_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_family_id BIGINT;
  v_dummy_member_id BIGINT;
  v_in_family BOOLEAN;
BEGIN
  -- Validate input
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Join code cannot be empty.';
  END IF;

  -- Verify the code and get the family_id
  SELECT id INTO v_family_id FROM public.families WHERE join_code = upper(trim(p_code));
  
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Invalid join code. Please check the code and try again.';
  END IF;

  -- Check if user is ALREADY in this family
  SELECT EXISTS (
    SELECT 1 FROM public.members 
    WHERE user_id = auth.uid() AND family_id = v_family_id
  ) INTO v_in_family;

  IF v_in_family THEN
    RETURN; -- Successfully joined (already in there)
  END IF;

  -- See if they have a dummy member record (from handle_new_user)
  SELECT id INTO v_dummy_member_id 
  FROM public.members 
  WHERE user_id = auth.uid() AND family_id IS NULL
  LIMIT 1;

  IF v_dummy_member_id IS NOT NULL THEN
    -- Update their dummy record to point to the new family
    UPDATE public.members 
    SET family_id = v_family_id,
        role = 'child',
        is_admin = FALSE
    WHERE id = v_dummy_member_id;
  ELSE
    -- If no dummy record but not in family (probably they already created another family)
    -- Multi-family scenario: insert a new member record
    INSERT INTO public.members (user_id, family_id, role, is_admin)
    VALUES (auth.uid(), v_family_id, 'child', FALSE);
  END IF;

END;
$$;
