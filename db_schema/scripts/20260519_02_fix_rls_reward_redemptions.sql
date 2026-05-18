-- Drop the old policy
DROP POLICY IF EXISTS "Members can view their family's redemptions" ON public.reward_redemptions;

-- Create the robust policy avoiding LIMIT 1 issues
CREATE POLICY "Members can view their family's redemptions"
ON public.reward_redemptions
FOR SELECT
USING (
  family_id IN (
    SELECT family_id 
    FROM public.members 
    WHERE user_id = auth.uid()
  )
);

-- Ensure permissions are explicitly granted just in case
GRANT SELECT ON public.reward_redemptions TO authenticated;
GRANT SELECT ON public.reward_redemptions TO anon;
