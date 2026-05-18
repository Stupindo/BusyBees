-- ==========================================
-- 20260519_01_add_reward_redemptions.sql
-- ==========================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
    gem_cost INT NOT NULL,
    cash_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
DROP POLICY IF EXISTS "Members can view their family's redemptions" ON public.reward_redemptions;
CREATE POLICY "Members can view their family's redemptions"
ON public.reward_redemptions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.members
        WHERE members.family_id = reward_redemptions.family_id
          AND members.user_id = auth.uid()
    )
);

-- Note: INSERT/UPDATE/DELETE are intentionally restricted.
-- They are handled entirely by SECURITY DEFINER RPC functions.

-- Ensure permissions are explicitly granted just in case
GRANT SELECT ON public.reward_redemptions TO authenticated;
GRANT SELECT ON public.reward_redemptions TO anon;

-- 4. Deploy RPC for requesting a payout
CREATE OR REPLACE FUNCTION request_payout(p_member_id BIGINT, p_gem_cost INT, p_cash_amount NUMERIC)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_family_id BIGINT;
    v_user_id UUID;
    v_balance INT;
    v_transaction_id BIGINT;
BEGIN
    -- Validate input
    IF p_gem_cost <= 0 OR p_cash_amount <= 0 THEN
        RETURN json_build_object('error', 'Amount must be greater than zero.');
    END IF;

    -- Get member and family info
    SELECT family_id, user_id INTO v_family_id, v_user_id
    FROM public.members
    WHERE id = p_member_id;

    IF v_family_id IS NULL THEN
        RETURN json_build_object('error', 'Member not found.');
    END IF;

    -- Verify caller owns the member profile
    IF v_user_id != auth.uid() THEN
        RETURN json_build_object('error', 'Unauthorized: Not your profile.');
    END IF;

    -- Calculate current balance
    SELECT COALESCE(SUM(CASE WHEN type = 'earning' THEN amount ELSE -amount END), 0) INTO v_balance
    FROM public.transactions
    WHERE member_id = p_member_id;

    -- Check if sufficient funds
    IF v_balance < p_gem_cost THEN
        RETURN json_build_object('error', 'Insufficient gems.');
    END IF;

    -- Insert payout transaction
    INSERT INTO public.transactions (member_id, amount, type, description)
    VALUES (p_member_id, p_gem_cost, 'payout', '💵 Cash Payout Request (Pending)')
    RETURNING id INTO v_transaction_id;

    -- Insert redemption record
    INSERT INTO public.reward_redemptions (family_id, member_id, transaction_id, status, gem_cost, cash_amount)
    VALUES (v_family_id, p_member_id, v_transaction_id, 'pending', p_gem_cost, p_cash_amount);

    RETURN json_build_object('success', true);
END;
$$;

-- 5. Deploy RPC for processing a payout
CREATE OR REPLACE FUNCTION process_payout(p_redemption_id BIGINT, p_status TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_family_id BIGINT;
    v_member_id BIGINT;
    v_transaction_id BIGINT;
    v_gem_cost INT;
    v_current_status TEXT;
    v_is_admin BOOLEAN;
BEGIN
    -- Validate input
    IF p_status NOT IN ('approved', 'declined') THEN
        RETURN json_build_object('error', 'Invalid status. Must be approved or declined.');
    END IF;

    -- Get redemption info
    SELECT family_id, member_id, transaction_id, status, gem_cost
    INTO v_family_id, v_member_id, v_transaction_id, v_current_status, v_gem_cost
    FROM public.reward_redemptions
    WHERE id = p_redemption_id;

    IF v_family_id IS NULL THEN
        RETURN json_build_object('error', 'Redemption not found.');
    END IF;

    IF v_current_status != 'pending' THEN
        RETURN json_build_object('error', 'Redemption is already processed.');
    END IF;

    -- Verify caller is an admin of this family
    SELECT EXISTS (
        SELECT 1 FROM public.members
        WHERE family_id = v_family_id AND user_id = auth.uid() AND (is_admin = TRUE OR role = 'parent')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN json_build_object('error', 'Unauthorized: Must be an admin.');
    END IF;

    IF p_status = 'approved' THEN
        -- Mark as approved
        UPDATE public.reward_redemptions
        SET status = 'approved', updated_at = NOW()
        WHERE id = p_redemption_id;

        -- Update transaction description
        IF v_transaction_id IS NOT NULL THEN
            UPDATE public.transactions
            SET description = '💵 Cash Payout Approved & Paid'
            WHERE id = v_transaction_id;
        END IF;
    ELSE
        -- Mark as declined
        UPDATE public.reward_redemptions
        SET status = 'declined', updated_at = NOW()
        WHERE id = p_redemption_id;

        -- Refund the child with an earning transaction
        INSERT INTO public.transactions (member_id, amount, type, description)
        VALUES (v_member_id, v_gem_cost, 'earning', '↩️ Refund: Cancelled Cash Payout Request');
    END IF;

    RETURN json_build_object('success', true);
END;
$$;
