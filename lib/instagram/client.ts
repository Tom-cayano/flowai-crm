// Meta Graph API client for Instagram Business Messaging.
// All calls are server-side only — access tokens never reach the browser.
//
// API version: v21.0
//
// Scopes (valid from January 27, 2025 — instagram_business_* namespace):
//   instagram_business_basic            (replaces instagram_basic)
//   instagram_business_manage_messages  (replaces instagram_manage_messages)
//   instagram_business_manage_comments  (replaces instagram_manage_comments)
//   pages_show_list                     (unchanged)
//   pages_read_engagement               (unchanged)
//   pages_manage_metadata               (unchanged — needed for webhook sub)
//
// Rate limits:
//   - DM sends:      250 conversations/hour per page
//   - API calls:     200 calls/hour per user token
//   - Comment reply: no hard limit, but respect Meta's anti-spam policy
//
// Docs: https://developers.facebook.com/docs/messenger-platform/instagram
//       https://developers.facebook.com/docs/instagram-platform/instagram-graph-api

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

// ─── Env helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve Instagram App ID with fallback chain:
 *   INSTAGRAM_APP_ID → META_APP_ID
 * Throws a descriptive error if neither is set.
 */
export function resolveAppId(): string {
  const id = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || "";
  if (!id) {
    throw new IGConfigError(
      "Instagram App ID not configured. " +
      "Set INSTAGRAM_APP_ID (or META_APP_ID as fallback) in environment variables. " +
      "Get your App ID from: Meta Developers → Your App → Settings → Basic."
    );
  }
  return id;
}

/**
 * Resolve Instagram App Secret with fallback chain:
 *   INSTAGRAM_APP_SECRET → META_APP_SECRET
 * Throws a descriptive error if neither is set.
 */
export function resolveAppSecret(): string {
  const secret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "";
  if (!secret) {
    throw new IGConfigError(
      "Instagram App Secret not configured. " +
      "Set INSTAGRAM_APP_SECRET (or META_APP_SECRET as fallback) in environment variables. " +
      "Get your App Secret from: Meta Developers → Your App → Settings → Basic → Show."
    );
  }
  // Guard against placeholder value left in .env.local
  if (secret === "REEMPLAZA_CON_TU_META_APP_SECRET") {
    throw new IGConfigError(
      "INSTAGRAM_APP_SECRET is still set to the placeholder value. " +
      "Replace it with the real App Secret from Meta Developers → Your App → Settings → Basic."
    );
  }
  return secret;
}

/**
 * Resolve the public base URL used to construct redirect_uri.
 * Must match exactly what is registered in Meta App Dashboard → Valid OAuth Redirect URIs.
 */
export function resolveBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_BASE_URL || "";
  if (!url) {
    throw new IGConfigError(
      "NEXT_PUBLIC_BASE_URL is not configured. " +
      "Set it to your production domain, e.g. https://www.flowaicrm.com"
    );
  }
  return url.replace(/\/$/, ""); // strip trailing slash
}

/**
 * Build the canonical redirect_uri that MUST match Meta App Dashboard exactly.
 * For FlowAI CRM: https://www.flowaicrm.com/api/instagram/oauth/callback
 */
export function resolveRedirectUri(): string {
  return `${resolveBaseUrl()}/api/instagram/oauth/callback`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IGUser {
  id:                    string;
  username:              string;
  name?:                 string;
  profile_picture_url?:  string;
  followers_count?:      number;
  website?:              string;
}

export interface IGSendResult {
  recipient_id:  string;
  message_id:    string;
}

export interface IGTokenInfo {
  access_token:  string;
  token_type:    string;
  expires_in?:   number;  // seconds; absent for non-expiring page tokens
}

export interface IGCommentReplyResult {
  id: string;  // new comment ID
}

export interface IGPage {
  id:           string;
  name:         string;
  access_token: string;   // page-level token (non-expiring)
  instagram_business_account?: { id: string };
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Thrown when a required environment variable is missing or invalid. */
export class IGConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IGConfigError";
  }
}

export class IGApiError extends Error {
  readonly code:       number | undefined;
  readonly type:       string | undefined;
  readonly httpStatus: number;

  constructor(message: string, code?: number, type?: string, httpStatus = 500) {
    super(message);
    this.name       = "IGApiError";
    this.code       = code;
    this.type       = type;
    this.httpStatus = httpStatus;
  }

  /** True when the error means the token has expired or been revoked. */
  get isTokenError(): boolean {
    // Meta error codes 190, 102 indicate invalid/expired tokens
    return this.code === 190 || this.code === 102 || this.httpStatus === 401;
  }

  /** True when the request was rate-limited. */
  get isRateLimited(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 32 || this.httpStatus === 429;
  }

  /** True when the error is a missing/invalid permission scope. */
  get isScopeError(): boolean {
    return this.code === 10 || this.code === 200 || this.code === 230;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function graphFetch<T>(
  path:    string,
  options: RequestInit = {},
): Promise<T> {
  const url  = `${GRAPH_API_BASE}${path}`;
  const res  = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    // Never cache — graph responses are always fresh data
    cache: "no-store",
  });

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok || json.error) {
    const err = json.error as { message?: string; code?: number; type?: string } | undefined;
    throw new IGApiError(
      err?.message ?? `HTTP ${res.status}`,
      err?.code,
      err?.type,
      res.status,
    );
  }

  return json as T;
}

// ─── Account / token ──────────────────────────────────────────────────────────

/**
 * Exchange a short-lived user access token for a long-lived one (60 days).
 * Call once during OAuth callback.
 *
 * Required env vars (with fallback chain):
 *   INSTAGRAM_APP_ID     → META_APP_ID
 *   INSTAGRAM_APP_SECRET → META_APP_SECRET
 *
 * The redirect_uri used here MUST be identical to the one sent in step 1.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<IGTokenInfo> {
  const appId     = resolveAppId();
  const appSecret = resolveAppSecret();

  console.info("[ig-client] exchangeForLongLivedToken — appId:", appId);

  const params = new URLSearchParams({
    grant_type:        "fb_exchange_token",
    client_id:         appId,
    client_secret:     appSecret,
    fb_exchange_token: shortLivedToken,
  });

  try {
    const result = await graphFetch<IGTokenInfo>(`/oauth/access_token?${params.toString()}`);
    const expiresInDays = result.expires_in ? Math.round(result.expires_in / 86400) : "N/A";
    console.info(`[ig-client] Long-lived token obtained — expires in ${expiresInDays} days`);
    return result;
  } catch (err) {
    console.error("[ig-client] exchangeForLongLivedToken failed:", err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * Refresh a long-lived token before it expires (call when < 10 days remain).
 * Returns a fresh 60-day token.
 *
 * Required env vars:
 *   INSTAGRAM_APP_SECRET → META_APP_SECRET
 */
export async function refreshLongLivedToken(
  currentToken: string,
): Promise<IGTokenInfo> {
  const appSecret = resolveAppSecret();

  console.info("[ig-client] refreshLongLivedToken — refreshing expiring token");

  const params = new URLSearchParams({
    grant_type:        "fb_exchange_token",
    client_secret:     appSecret,
    fb_exchange_token: currentToken,
  });

  try {
    const result = await graphFetch<IGTokenInfo>(`/oauth/access_token?${params.toString()}`);
    const expiresInDays = result.expires_in ? Math.round(result.expires_in / 86400) : "N/A";
    console.info(`[ig-client] Token refreshed — new expiry in ${expiresInDays} days`);
    return result;
  } catch (err) {
    console.error("[ig-client] refreshLongLivedToken failed:", err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * Get the Instagram Business User linked to the token.
 * Requires instagram_business_basic permission (replaces deprecated instagram_basic).
 */
export async function getIGUser(accessToken: string): Promise<IGUser> {
  const params = new URLSearchParams({
    fields:       "id,username,name,profile_picture_url,followers_count,website",
    access_token: accessToken,
  });
  return graphFetch<IGUser>(`/me?${params.toString()}`);
}

/**
 * List Facebook Pages the token has access to, including linked Instagram
 * Business Account IDs.
 * Requires pages_show_list permission.
 */
export async function getPages(accessToken: string): Promise<IGPage[]> {
  const params = new URLSearchParams({
    fields:       "id,name,access_token,instagram_business_account",
    access_token: accessToken,
  });
  const data = await graphFetch<{ data: IGPage[] }>(`/me/accounts?${params.toString()}`);
  return data.data ?? [];
}

/**
 * Subscribe a Facebook Page to receive Instagram webhook events.
 * Must be called once during account connection.
 * Requires pages_manage_metadata permission.
 */
export async function subscribePageToWebhooks(
  pageId:          string,
  pageAccessToken: string,
): Promise<void> {
  await graphFetch(`/${pageId}/subscribed_apps`, {
    method: "POST",
    body: JSON.stringify({
      subscribed_fields: ["messages", "messaging_reads", "comments", "mentions"],
      access_token:      pageAccessToken,
    }),
  });
}

// ─── Messaging ────────────────────────────────────────────────────────────────

/**
 * Send a text DM to an Instagram user via the Messenger Platform.
 * Recipient must have sent a message first (24h messaging window) or the
 * page must have been granted human_agent permission (7-day window).
 * Requires instagram_business_manage_messages permission.
 */
export async function sendDM(
  recipientIgId: string,
  text:          string,
  pageAccessToken: string,
): Promise<IGSendResult> {
  return graphFetch<IGSendResult>(`/me/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient:    { id: recipientIgId },
      message:      { text },
      messaging_type: "RESPONSE",
      access_token: pageAccessToken,
    }),
  });
}

/**
 * Send a DM with an image attachment.
 * Requires instagram_business_manage_messages permission.
 */
export async function sendImageDM(
  recipientIgId:   string,
  imageUrl:        string,
  pageAccessToken: string,
): Promise<IGSendResult> {
  return graphFetch<IGSendResult>(`/me/messages`, {
    method: "POST",
    body: JSON.stringify({
      recipient: { id: recipientIgId },
      message: {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: false },
        },
      },
      messaging_type: "RESPONSE",
      access_token:   pageAccessToken,
    }),
  });
}

// ─── Comments ─────────────────────────────────────────────────────────────────

/**
 * Reply to a comment on a post or reel.
 * Requires instagram_business_manage_comments permission.
 */
export async function replyToComment(
  commentId:       string,
  text:            string,
  pageAccessToken: string,
): Promise<IGCommentReplyResult> {
  return graphFetch<IGCommentReplyResult>(`/${commentId}/replies`, {
    method: "POST",
    body: JSON.stringify({
      message:      text,
      access_token: pageAccessToken,
    }),
  });
}

/**
 * Hide or unhide a comment.
 * Requires instagram_business_manage_comments permission.
 */
export async function setCommentVisibility(
  commentId:       string,
  hidden:          boolean,
  pageAccessToken: string,
): Promise<void> {
  await graphFetch(`/${commentId}`, {
    method: "POST",
    body: JSON.stringify({
      is_hidden:    hidden,
      access_token: pageAccessToken,
    }),
  });
}

// ─── Media ────────────────────────────────────────────────────────────────────

/**
 * Fetch metadata for a media object (post, reel, story).
 */
export async function getMedia(
  mediaId:         string,
  pageAccessToken: string,
): Promise<{ id: string; media_type: string; timestamp: string; permalink?: string }> {
  const params = new URLSearchParams({
    fields:       "id,media_type,timestamp,permalink",
    access_token: pageAccessToken,
  });
  return graphFetch(`/${mediaId}?${params.toString()}`);
}

// ─── Webhook verification ──────────────────────────────────────────────────────

import { createHmac, createHash, timingSafeEqual } from "crypto";

/**
 * Verify the X-Hub-Signature-256 header sent by Meta on every webhook POST.
 * Returns true if the signature matches, false otherwise.
 * MUST be called with the raw request body bytes (before JSON parsing).
 *
 * Uses INSTAGRAM_APP_SECRET → META_APP_SECRET fallback chain.
 */
export function verifyWebhookSignature(
  rawBody:   Buffer | string,
  signature: string,
): boolean {
  const isBuffer = Buffer.isBuffer(rawBody);
  const rawBodyBuffer = isBuffer ? rawBody : Buffer.from(rawBody);

  const envIGSecret = process.env.INSTAGRAM_APP_SECRET || "";
  const envMetaSecret = process.env.META_APP_SECRET || "";
  
  let usedVarName = "";
  let appSecret = "";
  if (envIGSecret) {
    usedVarName = "INSTAGRAM_APP_SECRET";
    appSecret = envIGSecret.trim();
  } else if (envMetaSecret) {
    usedVarName = "META_APP_SECRET";
    appSecret = envMetaSecret.trim();
  }

  console.log("[IG SECRET SOURCE]", {
    usedVarName,
    hasSecret: !!appSecret,
    secretLength: appSecret.length,
    secretPrefix: appSecret.slice(0, 4),
  });

  if (!appSecret) {
    console.warn("[ig-client] verifyWebhookSignature: no app secret configured — rejecting");
    return false;
  }

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(rawBodyBuffer)
    .digest("hex")}`;

  const bodyHash = createHash("sha256").update(rawBodyBuffer).digest("hex");

  console.log("[IG HMAC DEBUG]", {
    hasSignature: !!signature,
    signaturePrefix: signature?.slice(0, 20),
    bodyType: isBuffer ? "Buffer" : typeof rawBody,
    bodyLength: rawBodyBuffer.length,
    bodyHash: bodyHash,
    expectedPrefix: expected.slice(0, 20),
    receivedPrefix: signature?.slice(0, 20),
  });

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch (err) {
    console.warn("[ig-client] timingSafeEqual failed (likely length mismatch):", (err as Error).message);
    return false;
  }
}

// ─── Config health check ──────────────────────────────────────────────────────

export interface IGConfigCheck {
  ok:          boolean;
  appId:       string | null;
  redirectUri: string | null;
  issues:      string[];
  warnings:    string[];
}

/**
 * Validate all required Instagram OAuth configuration.
 * Call from the health check endpoint (/api/instagram/health).
 * Never returns secrets — only presence/validity signals.
 */
export function checkIGConfig(): IGConfigCheck {
  const issues:   string[] = [];
  const warnings: string[] = [];

  // App ID
  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID || "";
  if (!appId) {
    issues.push("MISSING: INSTAGRAM_APP_ID (or META_APP_ID) — OAuth cannot start");
  }

  // App Secret
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "";
  if (!appSecret) {
    issues.push("MISSING: INSTAGRAM_APP_SECRET (or META_APP_SECRET) — token exchange will fail");
  } else if (appSecret === "REEMPLAZA_CON_TU_META_APP_SECRET") {
    issues.push("PLACEHOLDER: INSTAGRAM_APP_SECRET is still set to the placeholder value");
  }

  // Base URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  if (!baseUrl) {
    issues.push("MISSING: NEXT_PUBLIC_BASE_URL — redirect_uri cannot be constructed");
  } else if (baseUrl.includes("localhost")) {
    warnings.push("WARN: NEXT_PUBLIC_BASE_URL points to localhost — Meta will reject the redirect_uri in production");
  }

  // Encryption key — .trim() is critical: Vercel CLI / copy-paste tools
  // silently append \n making a 64-char key appear as 65.
  const encKeyRaw = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY || "";
  const encKey    = encKeyRaw.trim();
  if (!encKey) {
    issues.push("MISSING: INSTAGRAM_TOKEN_ENCRYPTION_KEY — tokens cannot be stored");
  } else if (encKey.length !== 64) {
    // Diagnostic: show length and first/last chars without exposing full secret
    const firstChars = encKey.slice(0, 4);
    const lastChars  = encKey.slice(-4);
    console.error(
      `[ig-config] INSTAGRAM_TOKEN_ENCRYPTION_KEY length=${encKey.length} ` +
      `first=${firstChars} last=${lastChars} ` +
      `rawLength=${encKeyRaw.length} trimmedLength=${encKey.length}`
    );
    issues.push(
      `INVALID: INSTAGRAM_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes), ` +
      `got ${encKey.length} after trim (raw was ${encKeyRaw.length})`
    );
  } else if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
    issues.push("INVALID: INSTAGRAM_TOKEN_ENCRYPTION_KEY contains non-hex characters");
  }

  // Webhook verify token
  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || "";
  if (!verifyToken) {
    warnings.push("MISSING: INSTAGRAM_WEBHOOK_VERIFY_TOKEN — webhooks cannot be verified");
  }

  const redirectUri = baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/instagram/oauth/callback` : null;

  return {
    ok:  issues.length === 0,
    appId:       appId || null,
    redirectUri,
    issues,
    warnings,
  };
}
