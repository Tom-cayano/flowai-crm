-- Ensure trigger_type allows null and has a default so drafts without
-- a trigger node do not violate a NOT NULL constraint.
alter table public.automations
  alter column trigger_type drop not null,
  alter column trigger_type set default '';
