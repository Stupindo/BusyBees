-- =====================================================================
-- Migration: Add weekly_settlements table and RPCs for early week completion
-- =====================================================================

-- 1. Create weekly_settlements table
CREATE TABLE IF NOT EXISTS public.weekly_settlements (
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    is_early BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (family_id, week_start_date)
);

-- 2. Create complete_week_early RPC
CREATE OR REPLACE FUNCTION public.complete_week_early(p_family_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_admin_count INT;
    v_week_start DATE;
    v_child RECORD;
    v_template RECORD;
    v_unfinished_count INT;
    v_reward INT;
    v_inserted_tx INT := 0;
    v_updated_chores INT := 0;
BEGIN
    -- Verify caller is admin of this family
    SELECT COUNT(*) INTO v_admin_count
    FROM public.members
    WHERE user_id = auth.uid()
      AND family_id = p_family_id
      AND (role = 'parent' OR is_admin = true);

    IF v_admin_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

    -- Check if already processed
    IF EXISTS (
        SELECT 1 FROM public.weekly_settlements
        WHERE family_id = p_family_id AND week_start_date = v_week_start
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Week already processed');
    END IF;

    -- Loop over children in the family
    FOR v_child IN
        SELECT id FROM public.members WHERE family_id = p_family_id AND role = 'child'
    LOOP
        -- Get template
        SELECT id, total_reward, penalty_per_task INTO v_template
        FROM public.weekly_templates
        WHERE member_id = v_child.id;

        IF FOUND THEN
            -- Count pending/failed mandatory chores for this week
            SELECT COUNT(*) INTO v_unfinished_count
            FROM public.chore_instances ci
            JOIN public.chores c ON ci.chore_id = c.id
            WHERE ci.member_id = v_child.id
              AND ci.week_start_date = v_week_start
              AND ci.status IN ('pending', 'failed')
              AND c.is_backlog = false;

            -- Reward calculation
            v_reward := GREATEST(0, v_template.total_reward - (v_unfinished_count * v_template.penalty_per_task));

            -- Insert transaction if reward > 0
            IF v_reward > 0 THEN
                INSERT INTO public.transactions (member_id, amount, type, description)
                VALUES (v_child.id, v_reward, 'earning', '[Early] Weekly allowance harvest');
                v_inserted_tx := v_inserted_tx + 1;
            END IF;

            -- Mark pending chores as failed with a hidden note
            UPDATE public.chore_instances ci
            SET status = 'failed',
                notes = COALESCE(ci.notes || E'\n', '') || '[System] Week completed early'
            FROM public.chores c
            WHERE ci.chore_id = c.id
              AND ci.member_id = v_child.id
              AND ci.week_start_date = v_week_start
              AND ci.status = 'pending';
            
            v_updated_chores := v_updated_chores + 1;
        END IF;
    END LOOP;

    -- Mark week as processed
    INSERT INTO public.weekly_settlements (family_id, week_start_date, is_early)
    VALUES (p_family_id, v_week_start, true);

    -- Generate next week's chores. Wait, let's just let the cron job or regular fetch do it,
    -- or we can do it here by calling generate_week_chores. But generate_week_chores uses CURRENT_DATE.
    -- The user requirement is just "complete the week - review the rewards added". 
    -- We can omit generating next week's chores to make reverting much cleaner and simpler,
    -- and the cron job will naturally generate next week's chores on Sunday. 
    -- Next week starts on Monday, there's no need to generate them on Friday.

    RETURN json_build_object('success', true, 'transactions_inserted', v_inserted_tx, 'members_updated', v_updated_chores);
END;
$$;

-- 3. Create revert_week_early RPC
CREATE OR REPLACE FUNCTION public.revert_week_early(p_family_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_admin_count INT;
    v_week_start DATE;
BEGIN
    -- Verify caller is admin
    SELECT COUNT(*) INTO v_admin_count
    FROM public.members
    WHERE user_id = auth.uid()
      AND family_id = p_family_id
      AND (role = 'parent' OR is_admin = true);

    IF v_admin_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

    -- Check if it was processed early
    IF NOT EXISTS (
        SELECT 1 FROM public.weekly_settlements
        WHERE family_id = p_family_id AND week_start_date = v_week_start AND is_early = true
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Week was not completed early or already reverted');
    END IF;

    -- Delete the transactions
    DELETE FROM public.transactions
    WHERE type = 'earning'
      AND description = '[Early] Weekly allowance harvest'
      AND member_id IN (
          SELECT id FROM public.members WHERE family_id = p_family_id
      )
      AND created_at >= (NOW() - INTERVAL '7 days'); -- Safety boundary

    -- Revert chore instances
    -- Only revert those that have the specific system note appended
    UPDATE public.chore_instances ci
    SET status = 'pending',
        notes = NULLIF(REPLACE(ci.notes, '[System] Week completed early', ''), '')
    FROM public.chores c
    WHERE ci.chore_id = c.id
      AND ci.member_id IN (SELECT id FROM public.members WHERE family_id = p_family_id)
      AND ci.week_start_date = v_week_start
      AND ci.status = 'failed'
      AND ci.notes LIKE '%[System] Week completed early%';

    -- Remove the settlement record
    DELETE FROM public.weekly_settlements
    WHERE family_id = p_family_id AND week_start_date = v_week_start;

    RETURN json_build_object('success', true);
END;
$$;
