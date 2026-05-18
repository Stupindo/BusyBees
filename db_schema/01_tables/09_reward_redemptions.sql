CREATE TABLE public.reward_redemptions (
    id BIGSERIAL PRIMARY KEY,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    transaction_id BIGINT REFERENCES public.transactions(id) ON DELETE SET NULL,
    status TEXT CHECK (status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
    gem_cost INT NOT NULL,
    cash_amount NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
