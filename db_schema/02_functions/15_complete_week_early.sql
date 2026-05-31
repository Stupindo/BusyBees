-- complete_week_early: Finalizes the current ISO week for all members with a template in a family early.
--
-- Logic:
--   a) Verifies the caller is a family admin.
--   b) Guards against double-processing using weekly_settlements.
--   c) For each member with a weekly template: calculates reward
--      (total_reward - SUM of effective penalties for unfinished mandatory chores),
--      records an '[Early] Weekly allowance harvest' transaction, and marks
--      remaining pending chores as 'failed'.
--      Effective penalty per chore = COALESCE(c.penalty_per_task, wt.penalty_per_task).
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
    v_result JSON;
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

    -- Calculate current Monday start date in database timezone (UTC)
    v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

    -- Call the unified, transactional weekly settlement core logic
    SELECT public.process_weekly_settlement(p_family_id, v_week_start, true) INTO v_result;

    RETURN v_result;
END;
$$;
