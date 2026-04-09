CREATE TABLE public.transactions (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT REFERENCES public.members(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    type TEXT CHECK (type IN ('earning', 'penalty', 'payout')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
