// Encrypted storage and retrieval of Instagram access tokens.
// Uses AES-256-GCM (authenticated encryption) so any tampering is detected.
//
// Required env var:
//   INSTAGRAM_TOKEN_ENCRYPTION_KEY  — 64 hex characters (32 bytes)
//   Generate:  openssl rand -hex 32
//
// The ciphertext format stored in the DB column (access_token_enc):
//   <iv_hex>:<authTag_hex>:<ciphertext_hex>
// All three segments are hex-encoded so they are safe TEXT values.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshLongLivedToken, type IGTokenInfo } from "./client";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES  = 12;  // 96-bit IV recommended for GCM
const TAG_BYTES = 16;  // 128-bit auth tag

function getEncryptionKey(): Buffer {
  // .trim() strips trailing \n, \r, spaces that Vercel CLI or copy-paste tools
  // may silently append — the root cause of "got 65" instead of 64.
  const hex = (process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? "").trim();
  if (hex.length !== 64) {
    throw new Error(
      `INSTAGRAM_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${hex.length}. ` +
      "Generate with: openssl rand -hex 32"
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "INSTAGRAM_TOKEN_ENCRYPTION_KEY contains non-hex characters. " +
      "Must be exactly 64 hex characters (0-9, a-f)."
    );
  }
  return Buffer.from(hex, "hex");
}

// ─── Encrypt / decrypt ────────────────────────────────────────────────────────

export function encryptToken(plaintext: string): string {
  const key    = getEncryptionKey();
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid token encoding");

  const [ivHex, tagHex, ctHex] = parts;
  const key       = getEncryptionKey();
  const iv        = Buffer.from(ivHex,  "hex");
  const tag       = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ctHex,  "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Read and decrypt the access token for a given Instagram account.
 * Returns null if the account does not exist or the token is unreadable.
 */
export async function getAccessToken(accountId: string): Promise<string | null> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("instagram_accounts")
      .select("access_token_enc")
      .eq("id", accountId)
      .single();

    if (!data?.access_token_enc) return null;
    return decryptToken(data.access_token_enc);
  } catch {
    return null;
  }
}

/**
 * Store a new (or refreshed) access token for an account.
 * Encrypts before writing.
 */
export async function saveAccessToken(
  accountId:   string,
  plainToken:  string,
  expiresAt:   Date | null,
): Promise<void> {
  const db  = createAdminClient();
  const enc = encryptToken(plainToken);

  await db.from("instagram_accounts").update({
    access_token_enc: enc,
    token_expires_at: expiresAt?.toISOString() ?? null,
    updated_at:       new Date().toISOString(),
  }).eq("id", accountId);
}

// ─── Refresh logic ────────────────────────────────────────────────────────────

/**
 * Refresh a long-lived token if it expires within `thresholdDays`.
 * Safe to call on a schedule — skips refresh if not yet needed.
 * Returns true if a refresh was performed.
 */
export async function maybeRefreshToken(
  accountId:     string,
  thresholdDays: number = 10,
): Promise<boolean> {
  const db = createAdminClient();
  const { data: account } = await db
    .from("instagram_accounts")
    .select("access_token_enc, token_expires_at, connection_state")
    .eq("id", accountId)
    .single();

  if (!account) return false;
  if (account.connection_state === "disconnected") return false;

  // If no expiry recorded (page tokens don't expire), skip
  if (!account.token_expires_at) return false;

  const expiresAt    = new Date(account.token_expires_at);
  const daysRemaining = (expiresAt.getTime() - Date.now()) / 86_400_000;

  if (daysRemaining > thresholdDays) return false;

  try {
    const currentToken = decryptToken(account.access_token_enc);
    const refreshed: IGTokenInfo = await refreshLongLivedToken(currentToken);

    const newExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1_000)
      : null;

    await saveAccessToken(accountId, refreshed.access_token, newExpiresAt);

    // Clear any token_expired state
    await db.from("instagram_accounts").update({
      connection_state: "connected",
      last_error:       null,
    }).eq("id", accountId);

    return true;
  } catch (err) {
    // Mark account as token_expired so the UI shows a reconnect prompt
    await db.from("instagram_accounts").update({
      connection_state: "token_expired",
      last_error:       err instanceof Error ? err.message : String(err),
    }).eq("id", accountId);

    return false;
  }
}
