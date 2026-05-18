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
