-- Migration: Add avatar to members table
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS avatar TEXT;
