-- Add instance_id to conversations so the CRM knows which WhatsApp
-- instance owns each conversation and can route outbound replies correctly.
--
-- The column is nullable: existing conversations and non-WhatsApp channels
-- (email, Instagram, Messenger) don't need it.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS instance_id UUID
    REFERENCES public.whatsapp_instances(id)
    ON DELETE SET NULL;

-- Index for the back-fill query and future lookups
CREATE INDEX IF NOT EXISTS idx_conversations_instance_id
  ON public.conversations(instance_id)
  WHERE instance_id IS NOT NULL;

-- Back-fill: assign the user's most-recently-created connected instance
-- to any open WhatsApp conversation that still has NULL.
-- Safe to re-run (no-op if all rows are already filled).
UPDATE public.conversations c
SET instance_id = (
  SELECT wi.id
  FROM public.whatsapp_instances wi
  WHERE wi.user_id = c.user_id
    AND wi.connection_state = 'open'
  ORDER BY wi.created_at DESC
  LIMIT 1
)
WHERE c.channel = 'whatsapp'
  AND c.instance_id IS NULL;
