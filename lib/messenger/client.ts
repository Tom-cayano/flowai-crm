// Facebook Messenger client — server-side only.
//
// Responsibilities:
//   - Send text messages via Messenger Send API (Graph v21.0)
//   - Resolve page access tokens (facebook_pages table → env var fallback)
//   - HMAC-SHA256 webhook signature verification
//
// Required env vars:
//   META_APP_SECRET             — for webhook signature verification
//   INSTAGRAM_TOKEN_ENCRYPTION_KEY — reused for AES-256-GCM page token encryption
//
// Optional env vars (single-tenant / dev fallback):
//   FACEBOOK_PAGE_ID            — page_id to match for env-var fallback
//   FACEBOOK_PAGE_ACCESS_TOKEN  — plaintext page token (dev only)

import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/instagram/token-store";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessengerSendResult {
  recipient_id: string;
  message_id:   string;
}

// ─── Send API ─────────────────────────────────────────────────────────────────

/**
 * Send a text message to a Messenger user via the Send API.
 * pageToken must be a valid Page Access Token.
 */
export async function sendMessengerMessage(
  recipientPsid: string,
  text:          string,
  pageToken:     string,
): Promise<MessengerSendResult> {
  const res = await fetch(`${GRAPH_API_BASE}/me/messages?access_token=${pageToken}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      recipient: { id: recipientPsid },
      message:   { text },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message: string } };
    throw new Error(
      `Messenger Send API ${res.status}: ${err.error?.message ?? res.statusText}`
    );
  }

  return res.json() as Promise<MessengerSendResult>;
}

// ─── Page access token resolution ────────────────────────────────────────────

/**
 * Get the decrypted page access token for a given page_id.
 *
 * Resolution order:
 *   1. facebook_pages table (multi-tenant — set during Instagram OAuth callback)
 *   2. FACEBOOK_PAGE_ACCESS_TOKEN env var (single-tenant / dev fallback)
 *      — only used when FACEBOOK_PAGE_ID matches or is unset
 */
export async function getPageAccessToken(pageId: string): Promise<string | null> {
  // ── 1. DB lookup ──────────────────────────────────────────────────────────
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("facebook_pages")
      .select("page_access_token_enc")
      .eq("page_id", pageId)
      .eq("is_active", true)
      .maybeSingle();

    if (data?.page_access_token_enc) {
      return decryptToken(data.page_access_token_enc);
    }
  } catch (err) {
    console.warn("[messenger] getPageAccessToken DB error:", err);
  }

  // ── 2. Env var fallback ───────────────────────────────────────────────────
  const envPageId = process.env.FACEBOOK_PAGE_ID ?? "";
  const envToken  = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "";
  if (envToken && (!envPageId || envPageId === pageId)) {
    return envToken;
  }

  return null;
}

// ─── Webhook signature verification ──────────────────────────────────────────

/**
 * Verify the X-Hub-Signature-256 header sent by Meta.
 * Uses META_APP_SECRET and timingSafeEqual to prevent timing attacks.
 */
export function verifyMessengerSignature(body: Buffer, signatureHeader: string): boolean {
  const secret = process.env.META_APP_SECRET ?? "";
  if (!secret) {
    console.warn("[messenger] META_APP_SECRET not set — signature verification skipped");
    return false;
  }
  if (!signatureHeader.startsWith("sha256=")) return false;

  const received = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received,  "hex"),
    );
  } catch {
    // Lengths differ (malformed header) — reject
    return false;
  }
}
