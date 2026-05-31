-- Migration: Add metadata JSONB column to public.transactions for storing payout breakdowns.
ALTER TABLE public.transactions ADD COLUMN metadata JSONB DEFAULT NULL;
