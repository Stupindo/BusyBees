-- generate_week_chores: Merge function for the current ISO week.
--
-- Strategy:
--   Weekly chores (frequency = 'weekly'):
--     a) INSERT 'pending' instances for any template chore that doesn't yet
--        have an instance this week (keyed on chore_id + member_id + week_start_date,
--        with instance_date IS NULL).
--     b) UPDATE status to 'cancelled' for any 'pending' weekly instance whose chore
--        is no longer in the active template (or was deleted/switched to daily/backlog).
--
--   Daily chores (frequency = 'daily'):
--     c) INSERT 'pending' instances for each applicable day of the current ISO week
--        that doesn't yet have an instance (keyed on chore_id + member_id + week_start_date
--        + instance_date).  "Applicable" = recurrence_days IS NULL (all 7 days)
--        OR the ISO day-of-week is in the recurrence_days array.
--     d) UPDATE status to 'cancelled' for any 'pending' daily instance whose chore
--        is no longer in the template, OR whose specific instance_date is no longer
--        in the chore's recurrence_days.
--
-- Returns JSON: { "inserted": N, "cancelled": N }
-- Callable via: supabase.rpc('generate_week_chores', { p_family_id: X, p_member_id: Y })

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
