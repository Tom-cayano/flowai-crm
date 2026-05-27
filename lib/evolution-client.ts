/**
 * lib/evolution-client.ts
 *
 * Cliente Evolution API usando node:https nativo.
 * Reemplaza completamente el cliente basado en fetch() que devolvía 403 en Railway.
 *
 * Razón técnica del problema original:
 *   Next.js 16 + Turbopack parchea el fetch() global y añade headers propios
 *   (Next-URL, Next-Action, etc.) que Railway/WAF interpreta como tráfico
 *   inválido y bloquea con 403. node:https NO pasa por ese parche.
 */

import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

// ─── Configuración ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = "FlowAI-CRM/1.0 (node:https; Evolution-Client)";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface EvolutionInstance {
  instanceName: string;
  instanceId?: string;
  status?: string;
  serverUrl?: string;
  apikey?: string;
  owner?: string;
  profilePictureUrl?: string | null;
  profileName?: string | null;
  integration?: string;
  webhookWaBusiness?: string | null;
  accessTokenWaBusiness?: string | null;
}

export interface EvolutionConnectionState {
  instance: {
    instanceName: string;
    state: "open" | "connecting" | "close" | "refused" | string;
  };
}

export interface EvolutionQRCode {
  code?: string;
  base64?: string;
  count?: number;
  message?: string;
  pairingCode?: string | null;
  type?: string;
}

export interface EvolutionCreateInstancePayload {
  instanceName: string;
  qrcode?: boolean;
  integration?: string;
  token?: string;
  number?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
  webhookByEvents?: boolean;
  webhookBase64?: boolean;
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

export interface EvolutionSendTextPayload {
  number: string;
  text: string;
  delay?: number;
  quoted?: {
    key: { id: string };
    message: { conversation: string };
  };
}

export interface EvolutionResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  rawText?: string;
}

export interface EvolutionClientConfig {
  serverUrl: string;
  apiKey: string;
  timeoutMs?: number;
  debug?: boolean;
}

// ─── Helper: request con node:https ──────────────────────────────────────────

function makeRequest<T = unknown>(
  config: EvolutionClientConfig,
  method: "GET" | "POST" | "DELETE" | "PUT",
  path: string,
  body?: unknown
): Promise<EvolutionResponse<T>> {
  return new Promise((resolve, reject) => {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const debug = config.debug ?? false;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(path, config.serverUrl);
    } catch {
      reject(new Error(`[EvolutionClient] URL inválida: ${config.serverUrl}${path}`));
      return;
    }

    const bodyStr = body ? JSON.stringify(body) : null;
    const isHttps = parsedUrl.protocol === "https:";
    const port = parsedUrl.port
      ? Number(parsedUrl.port)
      : isHttps ? 443 : 80;

    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "apikey": config.apiKey,
        "User-Agent": USER_AGENT,
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr).toString() } : {}),
      },
    };

    if (debug) {
      console.log(
        `[EvolutionClient] ${method} ${parsedUrl.hostname}${options.path}`,
        body ? `body=${bodyStr?.slice(0, 200)}` : ""
      );
    }

    const transport = isHttps ? https : http;

    const req = (transport as typeof https).request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk: Buffer) => chunks.push(chunk));

      res.on("end", () => {
        const rawText = Buffer.concat(chunks).toString("utf8");
        const statusCode = res.statusCode ?? 0;

        if (debug) {
          console.log(
            `[EvolutionClient] ← ${statusCode} ${method} ${options.path} | ${rawText.slice(0, 300)}`
          );
        }

        let data: T;
        try {
          data = JSON.parse(rawText) as T;
        } catch {
          // La API devolvió texto plano o HTML (p.ej. error de proxy)
          if (statusCode >= 200 && statusCode < 300) {
            data = rawText as unknown as T;
          } else {
            reject(
              new Error(
                `[EvolutionClient] HTTP ${statusCode} — respuesta no-JSON: ${rawText.slice(0, 500)}`
              )
            );
            return;
          }
        }

        resolve({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, data, rawText });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`[EvolutionClient] Timeout tras ${timeoutMs}ms → ${method} ${path}`));
    });

    req.on("error", (err: NodeJS.ErrnoException) => {
      reject(new Error(`[EvolutionClient] Error de red: ${err.message} (${err.code ?? ""})`));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Clase principal ──────────────────────────────────────────────────────────

export class EvolutionClient {
  private config: Required<EvolutionClientConfig>;

  constructor(config: EvolutionClientConfig) {
    if (!config.serverUrl) throw new Error("[EvolutionClient] serverUrl es requerido");
    if (!config.apiKey) throw new Error("[EvolutionClient] apiKey es requerido");

    this.config = {
      serverUrl: config.serverUrl.replace(/\/$/, ""), // quitar trailing slash
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      debug: config.debug ?? process.env.NODE_ENV === "development",
    };
  }

  // ── Instancias ──────────────────────────────────────────────────────────

  async createInstance(
    payload: EvolutionCreateInstancePayload
  ): Promise<EvolutionResponse<EvolutionInstance>> {
    return makeRequest<EvolutionInstance>(this.config, "POST", "/instance/create", {
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      ...payload,
    });
  }

  async fetchInstances(): Promise<EvolutionResponse<EvolutionInstance[]>> {
    return makeRequest<EvolutionInstance[]>(this.config, "GET", "/instance/fetchInstances");
  }

  async fetchInstance(instanceName: string): Promise<EvolutionResponse<EvolutionInstance>> {
    return makeRequest<EvolutionInstance>(
      this.config,
      "GET",
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`
    );
  }

  async getConnectionState(
    instanceName: string
  ): Promise<EvolutionResponse<EvolutionConnectionState>> {
    return makeRequest<EvolutionConnectionState>(
      this.config,
      "GET",
      `/instance/connectionState/${encodeURIComponent(instanceName)}`
    );
  }

  async getQRCode(instanceName: string): Promise<EvolutionResponse<EvolutionQRCode>> {
    return makeRequest<EvolutionQRCode>(
      this.config,
      "GET",
      `/instance/connect/${encodeURIComponent(instanceName)}`
    );
  }

  async logoutInstance(instanceName: string): Promise<EvolutionResponse<{ error: boolean; message: string }>> {
    return makeRequest(
      this.config,
      "DELETE",
      `/instance/logout/${encodeURIComponent(instanceName)}`
    );
  }

  async deleteInstance(instanceName: string): Promise<EvolutionResponse<{ error: boolean; message: string }>> {
    return makeRequest(
      this.config,
      "DELETE",
      `/instance/delete/${encodeURIComponent(instanceName)}`
    );
  }

  async restartInstance(instanceName: string): Promise<EvolutionResponse<unknown>> {
    return makeRequest(
      this.config,
      "PUT",
      `/instance/restart/${encodeURIComponent(instanceName)}`
    );
  }

  // ── Mensajes ────────────────────────────────────────────────────────────

  async sendTextMessage(
    instanceName: string,
    payload: EvolutionSendTextPayload
  ): Promise<EvolutionResponse<unknown>> {
    return makeRequest(
      this.config,
      "POST",
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      payload
    );
  }

  async sendMediaMessage(
    instanceName: string,
    payload: {
      number: string;
      mediatype: "image" | "video" | "audio" | "document";
      mimetype: string;
      caption?: string;
      media: string; // URL o base64
      fileName?: string;
    }
  ): Promise<EvolutionResponse<unknown>> {
    return makeRequest(
      this.config,
      "POST",
      `/message/sendMedia/${encodeURIComponent(instanceName)}`,
      payload
    );
  }

  // ── Webhook ─────────────────────────────────────────────────────────────

  async setWebhook(
    instanceName: string,
    webhook: {
      url: string;
      byEvents?: boolean;
      base64?: boolean;
      events?: string[];
    }
  ): Promise<EvolutionResponse<unknown>> {
    return makeRequest(
      this.config,
      "POST",
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      { webhook }
    );
  }

  async getWebhook(instanceName: string): Promise<EvolutionResponse<unknown>> {
    return makeRequest(
      this.config,
      "GET",
      `/webhook/find/${encodeURIComponent(instanceName)}`
    );
  }
}

// ─── Singleton con ENV vars ───────────────────────────────────────────────────

let _singleton: EvolutionClient | null = null;

/**
 * getEvolutionClient()
 *
 * Devuelve el singleton del cliente Evolution, leyendo ENV vars automáticamente.
 * Úsalo en Server Actions y Route Handlers.
 *
 * @throws Si EVOLUTION_SERVER_URL o EVOLUTION_API_KEY no están definidas.
 */
export function getEvolutionClient(): EvolutionClient {
  if (_singleton) return _singleton;

  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;

  if (!serverUrl || serverUrl === "undefined" || serverUrl === "null") {
    throw new Error(
      "[EvolutionClient] EVOLUTION_SERVER_URL no está definida en .env.local\n" +
        "Añade: EVOLUTION_SERVER_URL=https://evolution-api-production-9497.up.railway.app"
    );
  }

  if (!apiKey || apiKey === "undefined" || apiKey === "null") {
    throw new Error(
      "[EvolutionClient] EVOLUTION_API_KEY no está definida en .env.local\n" +
        "Añade: EVOLUTION_API_KEY=flowai2026secure"
    );
  }

  _singleton = new EvolutionClient({
    serverUrl,
    apiKey,
    debug: process.env.NODE_ENV === "development",
  });

  console.log(
    `[EvolutionClient] Singleton inicializado → ${serverUrl.replace(/\/$/, "")}`
  );

  return _singleton;
}

/**
 * createEvolutionClient()
 *
 * Crea un cliente ad-hoc con URL y key personalizadas (multi-tenant).
 * Útil si cada organización tiene su propia instancia de Evolution API.
 */
export function createEvolutionClient(serverUrl: string, apiKey: string): EvolutionClient {
  if (!serverUrl) throw new Error("[EvolutionClient] serverUrl requerido");
  if (!apiKey) throw new Error("[EvolutionClient] apiKey requerido");
  return new EvolutionClient({ serverUrl, apiKey });
}

// ─── Export default para compatibilidad ──────────────────────────────────────

export default getEvolutionClient;
