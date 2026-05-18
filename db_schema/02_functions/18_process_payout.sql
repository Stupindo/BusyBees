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
