CREATE TABLE public.members (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    family_id BIGINT REFERENCES public.families(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('parent', 'child')),
    is_admin BOOLEAN DEFAULT FALSE,
    custom_name TEXT
);
