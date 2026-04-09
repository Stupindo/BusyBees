CREATE TABLE public.families (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    modified_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    modified_by UUID REFERENCES auth.users(id) ON DELETE CASCADE
);
