-- complete_week_early: Finalizes the current ISO week for all members with a template in a family early.
--
-- Logic:
--   a) Verifies the caller is a family admin.
--   b) Guards against double-processing using weekly_settlements.
--   c) For each member with a weekly template: calculates reward (total_reward - unfinished * penalty),
--      records an '[Early] Weekly allowance harvest' transaction, and marks
--      remaining pending chores as 'failed'.
--   d) Inserts a record into weekly_settlements to prevent the cron job re-processing.
--
-- Returns JSON: { "success": true, "transactions_inserted": N, "members_updated": N }
-- Callable via: supabase.rpc('complete_week_early', { p_family_id: X })

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
    v_bonus_reward INT;
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

    -- Loop over all members in the family who have a weekly template
    FOR v_child IN
        SELECT m.id
        FROM public.members m
        JOIN public.weekly_templates wt ON wt.member_id = m.id
        WHERE m.family_id = p_family_id
    LOOP
        -- Get template (COALESCE treats NULL reward/penalty as 0)
        SELECT id,
               COALESCE(total_reward, 0)     AS total_reward,
               COALESCE(penalty_per_task, 0) AS penalty_per_task
        INTO v_template
        FROM public.weekly_templates
        WHERE member_id = v_child.id;

        IF FOUND THEN
            -- Count still-pending mandatory chores for this week
            SELECT COUNT(*) INTO v_unfinished_count
            FROM public.chore_instances ci
            JOIN public.chores c ON ci.chore_id = c.id
            WHERE ci.member_id = v_child.id
              AND ci.week_start_date = v_week_start
              AND ci.status = 'pending'
              AND c.is_backlog = false;

            -- Reward calculation (mandatory chores base reward)
            v_reward := GREATEST(0, v_template.total_reward - (v_unfinished_count * v_template.penalty_per_task));

            -- Add extra_reward for each completed backlog (bonus) chore this week
            SELECT COALESCE(SUM(c.extra_reward), 0) INTO v_bonus_reward
            FROM public.chore_instances ci
            JOIN public.chores c ON ci.chore_id = c.id
            WHERE ci.member_id = v_child.id
              AND ci.week_start_date = v_week_start
              AND ci.status = 'done'
              AND c.is_backlog = true;

            v_reward := v_reward + v_bonus_reward;

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

    RETURN json_build_object('success', true, 'transactions_inserted', v_inserted_tx, 'members_updated', v_updated_chores);
END;
$$;
