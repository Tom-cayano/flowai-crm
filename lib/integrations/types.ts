// Universal webhook integration types.
// Shared by the public endpoint (/api/webhooks/leads), the management API,
// the lead processor and the retry worker.

// ─── Inbound payload contract ─────────────────────────────────────────────────
//
// POST /api/webhooks/leads
// Authorization: Bearer fw_...
// {
//   "source":      "Transforma Fit Coach",   // optional — defaults to the integration
//   "event":       "lead_created",
//   "contact":     { "name": "...", "email": "...", "phone": "...", "tags": [...], ...extra },
//   "custom_data": { ... }                   // any additional fields
// }
//
// Unknown keys inside "contact" are preserved in contacts.custom_fields —
// the contract is intentionally open so any application can connect.

export interface LeadWebhookContact {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  company?: string;
  location?: string;
  notes?: string;
  tags?: string[];
  /** Any additional field (goal, plan, utm_source, ...) — stored in custom_fields */
  [key: string]: unknown;
}

export interface LeadWebhookPayload {
  source?: string;
  event?: string;
  contact?: LeadWebhookContact;
  custom_data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Integration row (subset used by the processor) ──────────────────────────

export interface IntegrationRecord {
  id: string;
  user_id: string;
  name: string;
  source_key: string;
  enabled: boolean;
  hmac_secret: string | null;
  default_tags: string[];
}

// ─── Processing result ────────────────────────────────────────────────────────

export interface LeadProcessResult {
  contactId: string;
  contactCreated: boolean;
  automationsTriggered: Array<{ id: string; name: string }>;
}

export type SecurityReason =
  | "invalid_token"
  | "invalid_signature"
  | "rate_limited"
  | "disabled"
  | "invalid_payload";
