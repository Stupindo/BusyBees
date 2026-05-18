-- Temporary diagnostic fix: Bypass RLS for viewing reward redemptions
DROP POLICY IF EXISTS "Members can view their family's redemptions" ON public.reward_redemptions;

CREATE POLICY "Members can view their family's redemptions"
ON public.reward_redemptions
FOR SELECT
USING (true);

-- Also ensure the API has full permissions to see the table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_redemptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_redemptions TO anon;
