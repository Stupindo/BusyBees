-- =========================================================================
-- 01_tables/01_families.sql
-- =========================================================================
CREATE TABLE public.families (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    modified_by UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- =========================================================================
-- 01_tables/02_family_settings.sql
-- =========================================================================
CREATE TABLE public.family_settings (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    reset_day INT CHECK (reset_day BETWEEN 1 AND 7) DEFAULT 7,
    reset_time TIME DEFAULT '23:59:59',
    currency_rate NUMERIC DEFAULT 100,
    timezone TEXT DEFAULT 'UTC'
);

-- =========================================================================
-- 01_tables/03_members.sql
-- =========================================================================
CREATE TABLE public.members (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('parent', 'child')),
    is_admin BOOLEAN DEFAULT FALSE,
    custom_name TEXT
);

-- =========================================================================
-- 01_tables/04_weekly_templates.sql
-- =========================================================================
CREATE TABLE public.weekly_templates (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    total_reward INT,
    penalty_per_task INT
);

-- =========================================================================
-- 01_tables/05_chores.sql
-- =========================================================================
CREATE TABLE public.chores (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    template_id BIGINT REFERENCES public.weekly_templates(id) ON DELETE CASCADE,
    is_backlog BOOLEAN DEFAULT FALSE,
    extra_reward INT DEFAULT 0,
    description TEXT
);

-- =========================================================================
-- 01_tables/06_chore_instances.sql
-- =========================================================================
CREATE TABLE public.chore_instances (
    id BIGSERIAL PRIMARY KEY,
    chore_id BIGINT REFERENCES public.chores(id) ON DELETE CASCADE,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'done', 'failed')),
    week_start_date DATE,
    notes TEXT
);

-- =========================================================================
-- 01_tables/07_transactions.sql
-- =========================================================================
CREATE TABLE public.transactions (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    type TEXT CHECK (type IN ('earning', 'penalty', 'payout')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 02_functions/08_trigger_new_user.sql
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.members (user_id, family_id)
  VALUES (NEW.id, NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =========================================================================
-- 03_rls/01_rls_policies.sql
-- =========================================================================
-- Security Policies for BusyBees

-- 1. Enable RLS on all tables
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 2. Membership Helper Function
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

-- 3. RLS Policies using inline subselects to avoid infinite recursion

-- ==========================
-- TABLE: members
-- ==========================
CREATE POLICY "Select own member record or family members" ON public.members
FOR SELECT
USING (
  user_id = auth.uid()
  OR (family_id IS NOT NULL AND family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1))
);

CREATE POLICY "Insert own member record" ON public.members
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Parent/Admin UPDATE members" ON public.members
FOR UPDATE
USING (
  family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

CREATE POLICY "Parent/Admin DELETE members" ON public.members
FOR DELETE
USING (
  family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

-- ==========================
-- TABLE: families
-- ==========================
CREATE POLICY "View own family" ON public.families
FOR SELECT
USING (
  id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Insert family when no family_id" ON public.families
FOR INSERT
WITH CHECK (
  (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) IS NULL
);

CREATE POLICY "Parent/Admin UPDATE family" ON public.families
FOR UPDATE
USING (
  id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

CREATE POLICY "Parent/Admin DELETE family" ON public.families
FOR DELETE
USING (
  id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

-- ==========================
-- TABLE: family_settings
-- ==========================
CREATE POLICY "View family settings" ON public.family_settings
FOR SELECT
USING (
  family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Parent/Admin ALL family settings" ON public.family_settings
FOR ALL
USING (
  family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

-- ==========================
-- TABLE: weekly_templates
-- ==========================
CREATE POLICY "View weekly templates" ON public.weekly_templates
FOR SELECT
USING (
  family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Parent/Admin ALL weekly templates" ON public.weekly_templates
FOR ALL
USING (
  family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
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
    WHERE w.family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  )
);

CREATE POLICY "Parent/Admin ALL chores" ON public.chores
FOR ALL
USING (
  template_id IN (
    SELECT w.id FROM public.weekly_templates w 
    WHERE w.family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  )
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
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
    WHERE family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  )
);

CREATE POLICY "Parent/Admin ALL chore instances" ON public.chore_instances
FOR ALL
USING (
  member_id IN (
    SELECT id FROM public.members 
    WHERE family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  )
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

CREATE POLICY "Child UPDATE own chore instances" ON public.chore_instances
FOR UPDATE
USING (
  member_id = (SELECT m.id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  AND (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'child'
);

-- 3.1 Trigger to restrict columns a child can modify on chore_instances
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
    WHERE family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  )
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

CREATE POLICY "Parent/Admin INSERT transactions" ON public.transactions
FOR INSERT
WITH CHECK (
  member_id IN (
    SELECT id FROM public.members 
    WHERE family_id = (SELECT m.family_id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
  )
  AND (
    (SELECT m.role FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = 'parent'
    OR (SELECT m.is_admin FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1) = true
  )
);

CREATE POLICY "Child SELECT own transactions" ON public.transactions
FOR SELECT
USING (
  member_id = (SELECT m.id FROM public.members m WHERE m.user_id = auth.uid() LIMIT 1)
);
