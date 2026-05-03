-- Add RLS policy for weekly_settlements so authenticated family members
-- can read their own family's settlement status.
-- Without this, the client-side Supabase query returns no data even though
-- the SECURITY DEFINER RPC can write records successfully.

ALTER TABLE public.weekly_settlements ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated member to read settlements for their own family
CREATE POLICY "members_can_read_own_family_settlements"
ON public.weekly_settlements
FOR SELECT
TO authenticated
USING (
    family_id IN (
        SELECT family_id FROM public.members WHERE user_id = auth.uid()
    )
);

-- Only allow inserts/updates/deletes through the SECURITY DEFINER RPCs
-- (complete_week_early / revert_week_early / weekly-hive-reset),
-- so no direct client write policy is needed.
