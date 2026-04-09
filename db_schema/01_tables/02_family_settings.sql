CREATE TABLE public.family_settings (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    reset_day INT CHECK (reset_day BETWEEN 1 AND 7) DEFAULT 7,
    reset_time TIME DEFAULT '23:59:59',
    currency_rate NUMERIC DEFAULT 100,
    timezone TEXT DEFAULT 'UTC'
);
