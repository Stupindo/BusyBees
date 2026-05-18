-- Revert back to the original strict RLS policy
DROP POLICY IF EXISTS "Members can view their family's redemptions" ON public.reward_redemptions;

CREATE POLICY "Members can view their family's redemptions"
ON public.reward_redemptions
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.members
        WHERE members.family_id = reward_redemptions.family_id
          AND members.user_id = auth.uid()
    )
);

-- Note: The explicit GRANT SELECT statements are standard and safe to leave in place,
-- but the table is now fully secured by the strict RLS policy again.
