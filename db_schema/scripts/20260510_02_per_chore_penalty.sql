-- Migration: 20260510_02_per_chore_penalty
-- Adds a per-chore penalty override to the chores table.
--
-- Changes:
--   1. chores.penalty_per_task  INT DEFAULT NULL
--      When NULL  → the global weekly_templates.penalty_per_task applies.
--      When set   → this value overrides the template-level penalty for this chore.
--   2. get_today_chores()   — penalty_per_task now resolves via COALESCE(c.penalty_per_task, wt.penalty_per_task)
--   3. complete_week_early() — reward deduction switches from count × fixed to SUM of per-chore effective penalties

-- ============================================================
-- PART 1: Schema change
-- ============================================================

ALTER TABLE public.chores
    ADD COLUMN IF NOT EXISTS penalty_per_task INT DEFAULT NULL;

-- ============================================================
-- PART 2: Updated functions
-- ============================================================

-- ------------------------------------------------------------
-- get_today_chores: Returns chore_instances for the current ISO week (Mon–Sun)
-- for the given member, enriched with chore metadata.
--
-- Rules:
--   - Weekly chores (frequency = 'weekly'): all instances for the week are returned
--     (instance_date IS NULL).
--   - Daily chores (frequency = 'daily'): only the instance for TODAY is returned
--     (instance_date = CURRENT_DATE).
--
-- penalty_per_task per row resolves as COALESCE(c.penalty_per_task, wt.penalty_per_task):
--   chore-level override wins; falls back to the template-level global.
--
-- Ordered: pending first, then done, then cancelled/failed; regular before backlog; alpha by title.
-- Callable via: supabase.rpc('get_today_chores', { p_member_id: X })
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_today_chores(p_member_id BIGINT)
RETURNS TABLE (
    instance_id      BIGINT,
    chore_id         BIGINT,
    title            TEXT,
    description      TEXT,
    is_backlog       BOOLEAN,
    extra_reward     INT,
    status           TEXT,
    notes            TEXT,
    week_start_date  DATE,
    penalty_per_task INT,
    frequency        TEXT,
    recurrence_days  INT[],
    instance_date    DATE
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_week_start DATE;
BEGIN
    -- ISO week starts on Monday
    v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

    RETURN QUERY
    SELECT
        ci.id               AS instance_id,
        ci.chore_id,
        c.title,
        c.description,
        c.is_backlog,
        c.extra_reward,
        ci.status,
        ci.notes,
        ci.week_start_date,
        -- Chore-level override wins; falls back to template global
        COALESCE(c.penalty_per_task, wt.penalty_per_task) AS penalty_per_task,
        c.frequency,
        c.recurrence_days,
        ci.instance_date
    FROM public.chore_instances ci
    JOIN public.chores c ON c.id = ci.chore_id
    JOIN public.weekly_templates wt ON wt.id = c.template_id
    WHERE ci.member_id       = p_member_id
      AND ci.week_start_date = v_week_start
      -- Weekly chores: no date filter (instance_date IS NULL)
      -- Daily chores: only today's instance
      AND (
          c.frequency = 'weekly'
          OR (c.frequency = 'daily' AND ci.instance_date = CURRENT_DATE)
      )
    ORDER BY
        CASE ci.status
            WHEN 'pending'   THEN 1
            WHEN 'done'      THEN 2
            WHEN 'cancelled' THEN 3
            WHEN 'failed'    THEN 4
            ELSE 5
        END,
        c.is_backlog,
        c.title;
END;
$$;

-- ------------------------------------------------------------
-- complete_week_early: Finalizes the current ISO week for all members
-- with a template in a family early.
--
-- Logic:
--   a) Verifies the caller is a family admin.
--   b) Guards against double-processing using weekly_settlements.
--   c) For each member with a weekly template: calculates reward
--      (total_reward - SUM of effective penalties for unfinished mandatory chores),
--      records an '[Early] Weekly allowance harvest' transaction, and marks
--      remaining pending chores as 'failed'.
--      Effective penalty per chore = COALESCE(c.penalty_per_task, wt.penalty_per_task).
--   d) Inserts a record into weekly_settlements to prevent cron job re-processing.
--
-- Returns JSON: { "success": true, "transactions_inserted": N, "members_updated": N }
-- Callable via: supabase.rpc('complete_week_early', { p_family_id: X })
-- ------------------------------------------------------------

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
    v_penalty_sum INT;
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
            -- Sum effective penalties for still-pending mandatory chores this week.
            -- Per-chore override wins; falls back to the template global.
            SELECT COALESCE(SUM(
                COALESCE(c.penalty_per_task, v_template.penalty_per_task)
            ), 0) INTO v_penalty_sum
            FROM public.chore_instances ci
            JOIN public.chores c ON ci.chore_id = c.id
            WHERE ci.member_id = v_child.id
              AND ci.week_start_date = v_week_start
              AND ci.status = 'pending'
              AND c.is_backlog = false;

            -- Reward calculation (mandatory chores base reward minus total penalty)
            v_reward := GREATEST(0, v_template.total_reward - v_penalty_sum);

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
