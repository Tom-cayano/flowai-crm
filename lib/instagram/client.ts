// Meta Graph API client for Instagram Business Messaging.
// All calls are server-side only — access tokens never reach the browser.
//
// API version: v21.0 (current stable, August 2025)
// Rate limits:
//   - DM sends:      250 conversations/hour per page
//   - API calls:     200 calls/hour per user token
//   - Comment reply: no hard limit, but respect Meta's anti-spam policy
//
// Docs: https://developers.facebook.com/docs/messenger-platform/instagram

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

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
    // Meta error codes 190, 102, 200 indicate invalid/expired tokens
    return this.code === 190 || this.code === 102 || this.httpStatus === 401;
  }

  /** True when the request was rate-limited. */
  get isRateLimited(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 32 || this.httpStatus === 429;
  }
}

// ─── Account / token ──────────────────────────────────────────────────────────

/**
 * Exchange a short-lived user access token for a long-lived one (60 days).
 * Call once during OAuth callback.
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<IGTokenInfo> {
  const appId     = process.env.INSTAGRAM_APP_ID     ?? "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";

  const params = new URLSearchParams({
    grant_type:        "fb_exchange_token",
    client_id:         appId,
    client_secret:     appSecret,
    fb_exchange_token: shortLivedToken,
  });

  return graphFetch<IGTokenInfo>(`/oauth/access_token?${params.toString()}`);
}

/**
 * Refresh a long-lived token before it expires (do when < 10 days remain).
 * Returns a fresh 60-day token.
 */
export async function refreshLongLivedToken(
  currentToken: string,
): Promise<IGTokenInfo> {
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";
  const params    = new URLSearchParams({
    grant_type:   "fb_exchange_token",
    client_secret: appSecret,
    fb_exchange_token: currentToken,
  });

  return graphFetch<IGTokenInfo>(`/oauth/access_token?${params.toString()}`);
}

/**
 * Get the Instagram Business User linked to the token.
 * Requires instagram_basic + instagram_manage_messages permissions.
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
 * Requires instagram_manage_comments permission.
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

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify the X-Hub-Signature-256 header sent by Meta on every webhook POST.
 * Returns true if the signature matches, false otherwise.
 * MUST be called with the raw request body bytes (before JSON parsing).
 */
export function verifyWebhookSignature(
  rawBody:   Buffer | string,
  signature: string,
): boolean {
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";
  if (!appSecret) return false;

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}
