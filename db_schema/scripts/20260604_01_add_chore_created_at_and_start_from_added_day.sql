-- Migration: Add created_at column to chores table and update merge/settlement functions.

-- 1. Add created_at column to chores table if it doesn't exist
ALTER TABLE public.chores ADD COLUMN IF NOT EXISTS created_at DATE DEFAULT CURRENT_DATE;

-- 2. Backfill existing chores to a historic date so they are always generated
UPDATE public.chores SET created_at = '2020-01-01' WHERE created_at IS NULL OR created_at = CURRENT_DATE;

-- 3. Recreate generate_week_chores function
CREATE OR REPLACE FUNCTION public.generate_week_chores(
    p_family_id  BIGINT,
    p_member_id  BIGINT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_week_start    DATE;
    v_inserted      INT := 0;
    v_cancelled     INT := 0;
    v_delta         INT := 0;
    v_template_id   BIGINT;
    v_day           DATE;
BEGIN
    v_week_start := date_trunc('week', CURRENT_DATE)::DATE;

    -- Resolve template for this member in this family
    SELECT id INTO v_template_id
    FROM public.weekly_templates
    WHERE family_id = p_family_id
      AND member_id = p_member_id
    LIMIT 1;

    IF v_template_id IS NULL THEN
        RETURN json_build_object('inserted', 0, 'cancelled', 0, 'error', 'No template found for this member');
    END IF;

    -- -----------------------------------------------------------------------
    -- (a) Insert missing WEEKLY chore instances
    -- -----------------------------------------------------------------------
    WITH template_weekly AS (
        SELECT id AS chore_id
        FROM public.chores
        WHERE template_id = v_template_id
          AND is_deleted  = false
          AND frequency   = 'weekly'
          AND is_backlog  = false
          -- Only generate weekly instance if the chore template was created during or before this week.
          -- Weekly chores added with 'Add to Current Week' (created_at = today) will be <= Sunday of this week,
          -- while those deferred (created_at = next Monday) will not.
          AND created_at <= v_week_start + 6
    ),
    existing_weekly AS (
        SELECT chore_id
        FROM public.chore_instances
        WHERE member_id       = p_member_id
          AND week_start_date = v_week_start
          AND instance_date   IS NULL
    ),
    to_insert_weekly AS (
        SELECT tw.chore_id
        FROM template_weekly tw
        LEFT JOIN existing_weekly ew ON ew.chore_id = tw.chore_id
        WHERE ew.chore_id IS NULL
    )
    INSERT INTO public.chore_instances (chore_id, member_id, status, week_start_date, notes, instance_date)
    SELECT chore_id, p_member_id, 'pending', v_week_start, NULL, NULL
    FROM to_insert_weekly;

    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_inserted := v_inserted + v_delta;

    -- -----------------------------------------------------------------------
    -- (b) Cancel WEEKLY instances whose chores are no longer in the template
    -- -----------------------------------------------------------------------
    UPDATE public.chore_instances ci
    SET
        status = 'cancelled',
        notes  = COALESCE(ci.notes || E'\n', '') || '[System] Chore was removed from the weekly template.'
    FROM public.chores c
    WHERE ci.chore_id        = c.id
      AND ci.member_id       = p_member_id
      AND ci.week_start_date = v_week_start
      AND ci.status          = 'pending'
      AND ci.instance_date   IS NULL          -- weekly instances only
      AND (c.template_id != v_template_id OR c.is_deleted = true OR c.frequency = 'daily');

    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_cancelled := v_cancelled + v_delta;

    -- -----------------------------------------------------------------------
    -- (c) Insert missing DAILY chore instances (one per applicable day of the week)
    -- -----------------------------------------------------------------------
    FOR v_day IN
        SELECT gs::DATE
        FROM generate_series(v_week_start, v_week_start + INTERVAL '6 days', INTERVAL '1 day') gs
    LOOP
        WITH template_daily AS (
            SELECT id AS chore_id
            FROM public.chores
            WHERE template_id  = v_template_id
              AND is_deleted    = false
              AND frequency     = 'daily'
              AND is_backlog    = false
              -- Only generate instances for days on or after the chore template creation date.
              -- Ensures that daily chores added mid-week only generate instances from that day forward.
              AND v_day        >= created_at
              -- Applicable if recurrence_days is NULL (all days) or this day's ISO DOW is in the array
              AND (recurrence_days IS NULL
                   OR EXTRACT(ISODOW FROM v_day)::INT = ANY(recurrence_days))
        ),
        existing_daily AS (
            SELECT chore_id
            FROM public.chore_instances
            WHERE member_id       = p_member_id
              AND week_start_date = v_week_start
              AND instance_date   = v_day
        ),
        to_insert_daily AS (
            SELECT td.chore_id
            FROM template_daily td
            LEFT JOIN existing_daily ed ON ed.chore_id = td.chore_id
            WHERE ed.chore_id IS NULL
        )
        INSERT INTO public.chore_instances (chore_id, member_id, status, week_start_date, notes, instance_date)
        SELECT chore_id, p_member_id, 'pending', v_week_start, NULL, v_day
        FROM to_insert_daily;

        GET DIAGNOSTICS v_delta = ROW_COUNT;
        v_inserted := v_inserted + v_delta;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- (d) Cancel DAILY instances whose chore was removed or day no longer applies
    -- -----------------------------------------------------------------------
    UPDATE public.chore_instances ci
    SET
        status = 'cancelled',
        notes  = COALESCE(ci.notes || E'\n', '') || '[System] Chore was removed from the weekly template.'
    FROM public.chores c
    WHERE ci.chore_id        = c.id
      AND ci.member_id       = p_member_id
      AND ci.week_start_date = v_week_start
      AND ci.status          = 'pending'
      AND ci.instance_date   IS NOT NULL       -- daily instances only
      AND (
          c.template_id  != v_template_id
          OR c.is_deleted = true
          OR c.frequency  = 'weekly'           -- chore switched back to weekly
          -- Day no longer in recurrence_days (recurrence_days was narrowed)
          OR (c.recurrence_days IS NOT NULL
              AND NOT (EXTRACT(ISODOW FROM ci.instance_date)::INT = ANY(c.recurrence_days)))
      );

    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_cancelled := v_cancelled + v_delta;

    RETURN json_build_object('inserted', v_inserted, 'cancelled', v_cancelled);
END;
$$;


-- 4. Recreate process_weekly_settlement function
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
            -- Sum effective penalties for pending or failed mandatory chores this week.
            -- Per-chore override wins; falls back to the template global.
            SELECT 
                COUNT(*),
                COALESCE(SUM(COALESCE(c.penalty_per_task, v_template.penalty_per_task)), 0)
            INTO v_unfinished_count, v_penalty_sum
            FROM public.chore_instances ci
            JOIN public.chores c ON ci.chore_id = c.id
            WHERE ci.member_id = v_child.id
              AND ci.week_start_date = p_week_start
              AND ci.status IN ('pending', 'failed')
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
              AND c.is_backlog = false
              -- Only generate weekly chore if the chore template was created during or before the target week.
              AND c.created_at <= v_next_week_start + 6;

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
                  -- Only generate instances for days on or after the chore template creation date.
                  AND v_day >= c.created_at
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
