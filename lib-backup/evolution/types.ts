// ─── Evolution API v2 — response types ───────────────────────────────────────
//
// These types model the JSON responses returned by the Evolution API REST
// server. They are used exclusively in server-side code (lib/evolution/client,
// API route handlers). Never import these in Client Components.

// ─── Instance ─────────────────────────────────────────────────────────────────

export type EvolutionConnectionState = "open" | "close" | "connecting";

export interface EvolutionInstanceInfo {
  instanceName: string;
  status: EvolutionConnectionState;
  /** Phone number when connected, e.g. "5511999999999" */
  owner?: string;
  profileName?: string;
  profilePictureUrl?: string;
  integration?: string;
}

export interface EvolutionCreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  hash: {
    apikey: string;
  };
  settings?: Record<string, unknown>;
  qrcode?: {
    code?: string;
    base64?: string;
  };
}

export interface EvolutionConnectionStateResponse {
  instance: {
    instanceName: string;
    state: EvolutionConnectionState;
  };
}

export interface EvolutionQRCodeResponse {
  /** data:image/png;base64,... */
  base64?: string;
  code?: string;
  /** Some Evolution versions nest under qrcode */
  qrcode?: {
    base64?: string;
    code?: string;
  };
}

export interface EvolutionDeleteResponse {
  status: string;
  error?: string;
  response?: {
    message: string[];
  };
}

export interface EvolutionWebhookSetResponse {
  webhook: {
    enabled: boolean;
    url: string;
    events: string[];
  };
}

// ─── Webhook set payload ──────────────────────────────────────────────────────

export interface EvolutionWebhookConfig {
  enabled: boolean;
  url: string;
  webhook_by_events?: boolean;
  webhook_base64?: boolean;
  events: string[];
}

// ─── Result wrapper ───────────────────────────────────────────────────────────

export type EvolutionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; statusCode?: number };
