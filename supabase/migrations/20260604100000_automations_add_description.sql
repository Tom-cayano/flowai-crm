-- Add description column to automations table if it does not exist.
-- This migration is safe to run multiple times (IF NOT EXISTS guard).
alter table public.automations
  add column if not exists description text not null default '';
