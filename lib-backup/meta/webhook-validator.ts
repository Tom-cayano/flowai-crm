// Unified Meta webhook signature validator.
// All Meta platforms (WhatsApp Cloud, Instagram, Messenger) sign webhook POSTs
// with HMAC-SHA256 over the raw body using the App Secret as the key.
// The signature arrives in the X-Hub-Signature-256 header as "sha256=<hex>".
//
// Security: always use timingSafeEqual to prevent timing attacks.

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Generic Meta signature check.
 * @param rawBody   Raw request body bytes (before JSON.parse — critical!)
 * @param signature X-Hub-Signature-256 header value ("sha256=<hex>")
 * @param appSecret The Meta App Secret for this app
 */
export function verifyMetaSignature(
  rawBody:   Buffer | string,
  signature: string,
  appSecret: string,
): boolean {
  if (!appSecret) return false;
  if (!signature.startsWith("sha256=")) return false;

  const received = signature.slice("sha256=".length);
  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  if (received.length !== expected.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received,  "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Verify a WhatsApp Cloud API webhook request.
 * Uses META_APP_SECRET env var (same secret as Messenger).
 */
export function verifyWhatsAppCloudSignature(
  rawBody:   Buffer,
  signature: string,
): boolean {
  const secret = process.env.META_APP_SECRET ?? "";
  if (!secret) {
    console.warn("[webhook-validator] META_APP_SECRET not set — rejecting WAC event");
    return false;
  }
  return verifyMetaSignature(rawBody, signature, secret);
}

/**
 * Verify an Instagram Messaging webhook request.
 * Uses INSTAGRAM_APP_SECRET env var (may differ from META_APP_SECRET when
 * using a separate IG-specific app).
 * Falls back to META_APP_SECRET for single-app setups.
 */
export function verifyInstagramSignature(
  rawBody:   Buffer,
  signature: string,
): boolean {
  const secret =
    process.env.INSTAGRAM_APP_SECRET ??
    process.env.META_APP_SECRET       ??
    "";
  if (!secret) {
    console.warn("[webhook-validator] INSTAGRAM_APP_SECRET not set — rejecting IG event");
    return false;
  }
  return verifyMetaSignature(rawBody, signature, secret);
}

/**
 * Verify a Facebook Messenger webhook request.
 * Uses META_APP_SECRET env var.
 */
export function verifyMessengerSignature(
  rawBody:   Buffer,
  signature: string,
): boolean {
  const secret = process.env.META_APP_SECRET ?? "";
  if (!secret) {
    console.warn("[webhook-validator] META_APP_SECRET not set — rejecting Messenger event");
    return false;
  }
  return verifyMetaSignature(rawBody, signature, secret);
}
