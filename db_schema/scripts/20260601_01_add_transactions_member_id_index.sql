-- Migration: Add index on public.transactions(member_id) to optimize balance calculation and transaction history queries.
CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON public.transactions(member_id);
