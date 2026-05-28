// ─── Evolution API v2 — server-side HTTP client ───────────────────────────────
//
// ⚠️ SERVER-ONLY. This module calls the Evolution API server with a full
//    API key. Never import it in Client Components or expose credentials.
//
// All methods return an EvolutionResult<T> union so callers never need to
// try/catch — every network/HTTP error is mapped to { ok: false, error }.
//
// Usage:
//   const client = evolutionClient(serverUrl, apiKey);
//   const result = await client.getConnectionState("my-instance");
//   if (!result.ok) console.error(result.error);
//   else console.log(result.data.instance.state);

import type {
  EvolutionResult,
  EvolutionCreateInstanceResponse,
  EvolutionConnectionStateResponse,
  EvolutionQRCodeResponse,
  EvolutionDeleteResponse,
  EvolutionWebhookConfig,
  EvolutionWebhookSetResponse,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────

interface EvolutionClient {
  createInstance(
    instanceName: string,
    opts?: { token?: string; qrcode?: boolean }
  ): Promise<EvolutionResult<EvolutionCreateInstanceResponse>>;

  getConnectionState(
    instanceName: string
  ): Promise<EvolutionResult<EvolutionConnectionStateResponse>>;

  getQRCode(
    instanceName: string
  ): Promise<EvolutionResult<EvolutionQRCodeResponse>>;

  setWebhook(
    instanceName: string,
    config: EvolutionWebhookConfig
  ): Promise<EvolutionResult<EvolutionWebhookSetResponse>>;

  logout(instanceName: string): Promise<EvolutionResult<{ message: string }>>;

  deleteInstance(
    instanceName: string
  ): Promise<EvolutionResult<EvolutionDeleteResponse>>;

  restart(instanceName: string): Promise<EvolutionResult<{ message: string }>>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function evolutionClient(
  serverUrl: string,
  apiKey: string
): EvolutionClient {
  const base = serverUrl.replace(/\/$/, "");

  async function request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<EvolutionResult<T>> {
    const url = `${base}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        // Server-to-server — short timeout so a hung Evolution server doesn't
        // block Next.js route handlers indefinitely.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[evolution-client] Network error ${method} ${path}:`, msg);
      return { ok: false, error: msg };
    }

    if (!response.ok) {
      let detail = "";
      try {
        const text = await response.text();
        const json = JSON.parse(text) as Record<string, unknown>;
        detail = (json.message as string) ?? (json.error as string) ?? text;
      } catch {
        detail = `HTTP ${response.status}`;
      }
      console.error(`[evolution-client] ${method} ${path} → ${response.status}: ${detail}`);
      return { ok: false, error: detail, statusCode: response.status };
    }

    try {
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch {
      // 204 No Content or empty body
      return { ok: true, data: {} as T };
    }
  }

  return {
    createInstance(instanceName, opts = {}) {
      return request<EvolutionCreateInstanceResponse>("POST", "/instance/create", {
        instanceName,
        token: opts.token,
        qrcode: opts.qrcode ?? true,
        integration: "WHATSAPP-BAILEYS",
      });
    },

    getConnectionState(instanceName) {
      return request<EvolutionConnectionStateResponse>(
        "GET",
        `/instance/connectionState/${instanceName}`
      );
    },

    getQRCode(instanceName) {
      return request<EvolutionQRCodeResponse>(
        "GET",
        `/instance/connect/${instanceName}`
      );
    },

    setWebhook(instanceName, config) {
      return request<EvolutionWebhookSetResponse>(
        "POST",
        `/webhook/set/${instanceName}`,
        config
      );
    },

    logout(instanceName) {
      return request<{ message: string }>(
        "DELETE",
        `/instance/logout/${instanceName}`
      );
    },

    deleteInstance(instanceName) {
      return request<EvolutionDeleteResponse>(
        "DELETE",
        `/instance/delete/${instanceName}`
      );
    },

    restart(instanceName) {
      return request<{ message: string }>(
        "PUT",
        `/instance/restart/${instanceName}`
      );
    },
  };
}

// ─── Singleton from env vars ──────────────────────────────────────────────────
// For server actions and API routes that don't have per-user credentials yet.

export function getGlobalEvolutionClient(): EvolutionClient | null {
  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!serverUrl || !apiKey) return null;
  return evolutionClient(serverUrl, apiKey);
}

// ─── Extract QR base64 regardless of Evolution API version ───────────────────

export function extractQRBase64(raw: EvolutionQRCodeResponse): string | null {
  return (
    raw.base64 ??
    raw.qrcode?.base64 ??
    null
  );
}
