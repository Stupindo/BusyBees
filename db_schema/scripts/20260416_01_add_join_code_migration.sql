-- ==========================================
-- Migration: Add join_code to Families table
-- ==========================================

-- 1. Add the column
ALTER TABLE public.families ADD COLUMN join_code VARCHAR(6) UNIQUE;

-- 2. Create the random code generator function
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

-- 3. Backfill existing families with a unique join code
DO $$
DECLARE
  f record;
  new_code TEXT;
  is_unique BOOLEAN;
BEGIN
  FOR f IN SELECT id FROM public.families WHERE join_code IS NULL LOOP
    is_unique := FALSE;
    WHILE NOT is_unique LOOP
      new_code := public.generate_random_code(6);
      IF NOT EXISTS (SELECT 1 FROM public.families WHERE join_code = new_code) THEN
        is_unique := TRUE;
      END IF;
    END LOOP;
    UPDATE public.families SET join_code = new_code WHERE id = f.id;
  END LOOP;
END;
$$;

-- 4. Set trigger to auto-assign join code on new families
CREATE OR REPLACE FUNCTION public.assign_family_join_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  is_unique BOOLEAN := FALSE;
BEGIN
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

-- 5. Create the secure RPC to join the family
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
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Join code cannot be empty.';
  END IF;

  SELECT id INTO v_family_id FROM public.families WHERE join_code = upper(trim(p_code));
  
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Invalid join code. Please check the code and try again.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.members 
    WHERE user_id = auth.uid() AND family_id = v_family_id
  ) INTO v_in_family;

  IF v_in_family THEN
    RETURN; 
  END IF;

  SELECT id INTO v_dummy_member_id 
  FROM public.members 
  WHERE user_id = auth.uid() AND family_id IS NULL
  LIMIT 1;

  IF v_dummy_member_id IS NOT NULL THEN
    UPDATE public.members 
    SET family_id = v_family_id,
        role = 'child',
        is_admin = FALSE
    WHERE id = v_dummy_member_id;
  ELSE
    INSERT INTO public.members (user_id, family_id, role, is_admin)
    VALUES (auth.uid(), v_family_id, 'child', FALSE);
  END IF;
END;
$$;
