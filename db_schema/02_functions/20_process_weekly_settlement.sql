-- process_weekly_settlement: Core business logic for weekly reset and allowance harvest.
-- Runs atomically within a single SQL transaction.
--
-- Logic:
--   a) Guards against double-settlement.
--   b) Loops through each member with an active weekly template.
--   c) Calculates allowance (total_reward - SUM of penalties for unfinished mandatory chores)
--      plus extra rewards for completed backlog chores.
--   d) Records a '[Early] Weekly allowance harvest' or 'Weekly allowance harvest' transaction.
--   e) Marks pending chores of the completed week as 'failed'.
--   f) Generates a fresh set of weekly and daily chores for the upcoming week.
--   g) Records a weekly_settlements entry.
--
-- Returns JSON: { "success": true, "transactions_inserted": N, "members_updated": N, "next_week_start": DATE }
-- Callable via: supabase.rpc('process_weekly_settlement', { p_family_id: X, p_week_start: 'YYYY-MM-DD', p_is_early: BOOLEAN })

CREATE OR REPLACE FUNCTION public.process_weekly_settlement(
    p_family_id   BIGINT,
    p_week_start  DATE,
    p_is_early    BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_child RECORD;
    v_template RECORD;
    v_penalty_sum INT;
    v_bonus_reward INT;
    v_reward INT;
    v_inserted_tx INT := 0;
    v_updated_chores INT := 0;
    v_next_week_start DATE;
    v_day DATE;
    v_unfinished_count INT;
    v_completed_backlog_count INT;
BEGIN
    -- 1. Prevent double payout / double settlement for the same week
    IF EXISTS (
        SELECT 1 FROM public.weekly_settlements
        WHERE family_id = p_family_id AND week_start_date = p_week_start
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Week already settled');
    END IF;

    -- Calculate next week start date (exactly + 7 days)
    v_next_week_start := (p_week_start + INTERVAL '7 days')::DATE;

    -- 2. Loop over all family members who have an active weekly template
    FOR v_child IN
        SELECT m.id
        FROM public.members m
        JOIN public.weekly_templates wt ON wt.member_id = m.id
        WHERE m.family_id = p_family_id
    LOOP
        -- Get template details (COALESCE treats NULL reward/penalty as 0)
        SELECT id,
               COALESCE(total_reward, 0)     AS total_reward,
               COALESCE(penalty_per_task, 0) AS penalty_per_task
        INTO v_template
        FROM public.weekly_templates
        WHERE member_id = v_child.id;

        IF FOUND THEN
            -- Sum effective penalties for pending mandatory chores this week.
            -- Per-chore override wins; falls back to the template global.
            SELECT 
                COUNT(*),
                COALESCE(SUM(COALESCE(c.penalty_per_task, v_template.penalty_per_task)), 0)
            INTO v_unfinished_count, v_penalty_sum
            FROM public.chore_instances ci
            JOIN public.chores c ON ci.chore_id = c.id
            WHERE ci.member_id = v_child.id
              AND ci.week_start_date = p_week_start
              AND ci.status = 'pending'
              AND c.is_backlog = false;

            -- Sum bonus rewards for completed backlog chores this week
            SELECT 
                COUNT(*),
                COALESCE(SUM(c.extra_reward), 0)
            INTO v_completed_backlog_count, v_bonus_reward
            FROM public.chore_instances ci
            JOIN public.chores c ON ci.chore_id = c.id
            WHERE ci.member_id = v_child.id
              AND ci.week_start_date = p_week_start
              AND ci.status = 'done'
              AND c.is_backlog = true;

            -- Calculate final reward (mandatory base minus penalties, plus backlog bonuses)
            v_reward := GREATEST(0, v_template.total_reward - v_penalty_sum) + v_bonus_reward;

            -- 3. Record payout in transaction ledger
            IF v_reward > 0 THEN
                INSERT INTO public.transactions (member_id, amount, type, description, metadata)
                VALUES (
                    v_child.id, 
                    v_reward, 
                    'earning', 
                    CASE WHEN p_is_early THEN '[Early] Weekly allowance harvest' ELSE 'Weekly allowance harvest' END,
                    jsonb_build_object(
                        'week_start_date', p_week_start,
                        'base_allowance', v_template.total_reward,
                        'penalty_sum', v_penalty_sum,
                        'unfinished_mandatory_count', v_unfinished_count,
                        'bonus_reward', v_bonus_reward,
                        'completed_backlog_count', v_completed_backlog_count
                    )
                );
                v_inserted_tx := v_inserted_tx + 1;
            END IF;

            -- 4. Mark pending chores as failed
            UPDATE public.chore_instances ci
            SET status = 'failed',
                notes = COALESCE(ci.notes || E'\n', '') || 
                        CASE WHEN p_is_early THEN '[System] Week completed early' ELSE '[System] Weekly reset completed' END
            FROM public.chores c
            WHERE ci.chore_id = c.id
              AND ci.member_id = v_child.id
              AND ci.week_start_date = p_week_start
              AND ci.status = 'pending';

            v_updated_chores := v_updated_chores + 1;

            -- 5. Generate fresh chore instances for the upcoming week (v_next_week_start)
            
            -- A) Insert weekly chores (one instance per week, instance_date = NULL)
            INSERT INTO public.chore_instances (chore_id, member_id, status, week_start_date, instance_date)
            SELECT c.id, v_child.id, 'pending', v_next_week_start, NULL
            FROM public.chores c
            WHERE c.template_id = v_template.id
              AND c.is_deleted = false
              AND c.frequency = 'weekly'
              AND c.is_backlog = false;

            -- B) Insert daily chores (one instance per applicable day of the new week)
            FOR v_day IN
                SELECT gs::DATE
                FROM generate_series(v_next_week_start, v_next_week_start + INTERVAL '6 days', INTERVAL '1 day') gs
            LOOP
                INSERT INTO public.chore_instances (chore_id, member_id, status, week_start_date, instance_date)
                SELECT c.id, v_child.id, 'pending', v_next_week_start, v_day
                FROM public.chores c
                WHERE c.template_id = v_template.id
                  AND c.is_deleted = false
                  AND c.frequency = 'daily'
                  AND c.is_backlog = false
                  AND (c.recurrence_days IS NULL
                       OR EXTRACT(ISODOW FROM v_day)::INT = ANY(c.recurrence_days));
            END LOOP;
        END IF;
    END LOOP;

    -- 6. Insert weekly_settlements entry
    INSERT INTO public.weekly_settlements (family_id, week_start_date, is_early)
    VALUES (p_family_id, p_week_start, p_is_early);

    RETURN json_build_object(
        'success', true, 
        'transactions_inserted', v_inserted_tx, 
        'members_updated', v_updated_chores,
        'next_week_start', v_next_week_start
    );
END;
$$;
