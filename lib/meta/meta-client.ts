// Meta Graph API base client — server-side only.
// All channel-specific clients (whatsapp, instagram, messenger) build on this.
//
// API version: v21.0 (current stable)
// Docs: https://developers.facebook.com/docs/graph-api

export const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

// ─── Error ────────────────────────────────────────────────────────────────────

export class MetaApiError extends Error {
  readonly code:       number | undefined;
  readonly type:       string | undefined;
  readonly httpStatus: number;
  readonly fbtrace:    string | undefined;

  constructor(
    message:    string,
    code?:      number,
    type?:      string,
    httpStatus  = 500,
    fbtrace?:   string,
  ) {
    super(message);
    this.name       = "MetaApiError";
    this.code       = code;
    this.type       = type;
    this.httpStatus = httpStatus;
    this.fbtrace    = fbtrace;
  }

  get isTokenError(): boolean {
    return this.code === 190 || this.code === 102 || this.httpStatus === 401;
  }

  get isRateLimited(): boolean {
    return (
      this.code === 4 || this.code === 17 ||
      this.code === 32 || this.httpStatus === 429
    );
  }

  get isPermissionError(): boolean {
    return this.code === 10 || this.code === 200 || this.code === 230;
  }
}

// ─── Base fetcher ─────────────────────────────────────────────────────────────

export async function graphFetch<T>(
  path:    string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${GRAPH_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok || json.error) {
    const err = json.error as {
      message?: string;
      code?:    number;
      type?:    string;
      fbtrace_id?: string;
    } | undefined;

    throw new MetaApiError(
      err?.message ?? `HTTP ${res.status}`,
      err?.code,
      err?.type,
      res.status,
      err?.fbtrace_id,
    );
  }

  return json as T;
}

// ─── App-secret proof ─────────────────────────────────────────────────────────
// Required for server-side API calls when appsecret_proof is enforced in the App.

import { createHmac } from "crypto";

export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
