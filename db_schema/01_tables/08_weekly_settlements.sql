CREATE TABLE IF NOT EXISTS public.weekly_settlements (
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    is_early BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (family_id, week_start_date)
);
