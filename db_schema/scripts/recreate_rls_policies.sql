-- Cleanly recreate all RLS policies for BusyBees

-- 1. Safely drop existing triggers and functions
DROP TRIGGER IF EXISTS enforce_child_chore_update_columns ON public.chore_instances;
DROP FUNCTION IF EXISTS public.check_chore_instance_columns() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_member_data() CASCADE;

-- 2. Safely drop all existing policies
-- From members table
DROP POLICY IF EXISTS "Select own member record or family members" ON public.members;
DROP POLICY IF EXISTS "Insert own member record" ON public.members;
DROP POLICY IF EXISTS "Parent/Admin UPDATE members" ON public.members;
DROP POLICY IF EXISTS "Parent/Admin DELETE members" ON public.members;

-- From families table
DROP POLICY IF EXISTS "View own family" ON public.families;
DROP POLICY IF EXISTS "Insert family when no family_id" ON public.families;
DROP POLICY IF EXISTS "Parent/Admin UPDATE family" ON public.families;
DROP POLICY IF EXISTS "Parent/Admin DELETE family" ON public.families;

-- From family_settings table
DROP POLICY IF EXISTS "View family settings" ON public.family_settings;
DROP POLICY IF EXISTS "Parent/Admin ALL family settings" ON public.family_settings;

-- From weekly_templates table
DROP POLICY IF EXISTS "View weekly templates" ON public.weekly_templates;
DROP POLICY IF EXISTS "Parent/Admin ALL weekly templates" ON public.weekly_templates;

-- From chores table
DROP POLICY IF EXISTS "View chores" ON public.chores;
DROP POLICY IF EXISTS "Parent/Admin ALL chores" ON public.chores;

-- From chore_instances table
DROP POLICY IF EXISTS "View chore instances" ON public.chore_instances;
DROP POLICY IF EXISTS "Parent/Admin ALL chore instances" ON public.chore_instances;
DROP POLICY IF EXISTS "Child UPDATE own chore instances" ON public.chore_instances;

-- From transactions table
DROP POLICY IF EXISTS "Parent/Admin SELECT transactions" ON public.transactions;
DROP POLICY IF EXISTS "Parent/Admin INSERT transactions" ON public.transactions;
DROP POLICY IF EXISTS "Child SELECT own transactions" ON public.transactions;

-- 3. Enable RLS on all tables (idempotent operation)
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 4. Recreate the Membership Helper Function (Crucial for recursion fix)
CREATE OR REPLACE FUNCTION public.get_current_member_data()
RETURNS TABLE (
    family_id BIGINT,
    role TEXT,
    is_admin BOOLEAN,
    member_id BIGINT
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT family_id, role, is_admin, id
  FROM public.members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- 5. Recreate RLS Policies utilizing the Security Definer helper

-- ==========================
-- TABLE: members
-- ==========================
CREATE POLICY "Select own member record or family members" ON public.members
FOR SELECT
USING (
  user_id = auth.uid()
  OR (family_id IS NOT NULL AND family_id = (SELECT family_id FROM public.get_current_member_data()))
);

CREATE POLICY "Insert own member record" ON public.members
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Parent/Admin UPDATE members" ON public.members
FOR UPDATE
USING (
  family_id = (SELECT family_id FROM public.get_current_member_data())
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

CREATE POLICY "Parent/Admin DELETE members" ON public.members
FOR DELETE
USING (
  family_id = (SELECT family_id FROM public.get_current_member_data())
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

-- ==========================
-- TABLE: families
-- ==========================
CREATE POLICY "View own family" ON public.families
FOR SELECT
USING (
  id = (SELECT family_id FROM public.get_current_member_data())
  OR created_by = auth.uid()
);

CREATE POLICY "Insert family when no family_id" ON public.families
FOR INSERT
WITH CHECK (
  (SELECT family_id FROM public.get_current_member_data()) IS NULL
);

CREATE POLICY "Parent/Admin UPDATE family" ON public.families
FOR UPDATE
USING (
  id = (SELECT family_id FROM public.get_current_member_data())
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

CREATE POLICY "Parent/Admin DELETE family" ON public.families
FOR DELETE
USING (
  id = (SELECT family_id FROM public.get_current_member_data())
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

-- ==========================
-- TABLE: family_settings
-- ==========================
CREATE POLICY "View family settings" ON public.family_settings
FOR SELECT
USING (
  family_id = (SELECT family_id FROM public.get_current_member_data())
);

CREATE POLICY "Parent/Admin ALL family settings" ON public.family_settings
FOR ALL
USING (
  family_id = (SELECT family_id FROM public.get_current_member_data())
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

-- ==========================
-- TABLE: weekly_templates
-- ==========================
CREATE POLICY "View weekly templates" ON public.weekly_templates
FOR SELECT
USING (
  family_id = (SELECT family_id FROM public.get_current_member_data())
);

CREATE POLICY "Parent/Admin ALL weekly templates" ON public.weekly_templates
FOR ALL
USING (
  family_id = (SELECT family_id FROM public.get_current_member_data())
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

-- ==========================
-- TABLE: chores
-- ==========================
CREATE POLICY "View chores" ON public.chores
FOR SELECT
USING (
  template_id IN (
    SELECT w.id FROM public.weekly_templates w 
    WHERE w.family_id = (SELECT family_id FROM public.get_current_member_data())
  )
);

CREATE POLICY "Parent/Admin ALL chores" ON public.chores
FOR ALL
USING (
  template_id IN (
    SELECT w.id FROM public.weekly_templates w 
    WHERE w.family_id = (SELECT family_id FROM public.get_current_member_data())
  )
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

-- ==========================
-- TABLE: chore_instances
-- ==========================
CREATE POLICY "View chore instances" ON public.chore_instances
FOR SELECT
USING (
  member_id IN (
    SELECT id FROM public.members 
    WHERE family_id = (SELECT family_id FROM public.get_current_member_data())
  )
);

CREATE POLICY "Parent/Admin ALL chore instances" ON public.chore_instances
FOR ALL
USING (
  member_id IN (
    SELECT id FROM public.members 
    WHERE family_id = (SELECT family_id FROM public.get_current_member_data())
  )
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

CREATE POLICY "Child UPDATE own chore instances" ON public.chore_instances
FOR UPDATE
USING (
  member_id = (SELECT member_id FROM public.get_current_member_data())
  AND (SELECT role FROM public.get_current_member_data()) = 'child'
);

-- 6. Trigger to restrict columns a child can modify on chore_instances
CREATE OR REPLACE FUNCTION public.check_chore_instance_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user is a child
  IF (SELECT role FROM public.members WHERE user_id = auth.uid() LIMIT 1) = 'child' THEN
    -- They can only change status and notes. Everything else must remain identical.
    IF NEW.id IS DISTINCT FROM OLD.id 
       OR NEW.chore_id IS DISTINCT FROM OLD.chore_id 
       OR NEW.member_id IS DISTINCT FROM OLD.member_id 
       OR NEW.week_start_date IS DISTINCT FROM OLD.week_start_date THEN
      RAISE EXCEPTION 'Children can only update the status and notes columns.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_child_chore_update_columns
BEFORE UPDATE ON public.chore_instances
FOR EACH ROW
EXECUTE FUNCTION public.check_chore_instance_columns();

-- ==========================
-- TABLE: transactions
-- ==========================
CREATE POLICY "Parent/Admin SELECT transactions" ON public.transactions
FOR SELECT
USING (
  member_id IN (
    SELECT id FROM public.members 
    WHERE family_id = (SELECT family_id FROM public.get_current_member_data())
  )
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

CREATE POLICY "Parent/Admin INSERT transactions" ON public.transactions
FOR INSERT
WITH CHECK (
  member_id IN (
    SELECT id FROM public.members 
    WHERE family_id = (SELECT family_id FROM public.get_current_member_data())
  )
  AND (
    (SELECT role FROM public.get_current_member_data()) = 'parent'
    OR (SELECT is_admin FROM public.get_current_member_data()) = true
  )
);

CREATE POLICY "Child SELECT own transactions" ON public.transactions
FOR SELECT
USING (
  member_id = (SELECT member_id FROM public.get_current_member_data())
);
