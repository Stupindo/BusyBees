-- revert_week_early: Reverts an early week completion for a family.
--
-- Logic:
--   a) Verifies the caller is a family admin.
--   b) Checks that the current week was completed early (is_early = true).
--   c) Deletes the '[Early] Weekly allowance harvest' transactions.
--   d) Reverts chore instances tagged with '[System] Week completed early' back to 'pending'.
--   e) Removes the weekly_settlements record so the week is open again.
--
-- Returns JSON: { "success": true }
-- Callable via: supabase.rpc('revert_week_early', { p_family_id: X })

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

    -- Revert chore instances that were force-failed by the early completion
    UPDATE public.chore_instances ci
    SET status = 'pending',
        notes = NULLIF(TRIM(REPLACE(ci.notes, '[System] Week completed early', '')), '')
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
