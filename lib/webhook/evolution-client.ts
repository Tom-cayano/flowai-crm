// ─── Evolution API HTTP client ────────────────────────────────────────────────
//
// Handles outbound calls from FlowAI CRM to the Evolution API server.
// Used by the automation engine and AI auto-reply to send messages back
// through the same WhatsApp instance that received the incoming webhook.
//
// Per-instance credentials (server_url, api_key) come from the
// `whatsapp_instances` table so different CRM users can have different
// Evolution API servers.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendTextPayload {
  /** Destination phone number — digits only, e.g. "5511999999999" */
  phone: string;
  text: string;
  /** Delay in ms before Evolution simulates typing (default 1200) */
  delayMs?: number;
}

export interface SendTextResult {
  ok: boolean;
  externalId?: string; // WhatsApp message ID returned by Evolution
  error?: string;
}

// ─── Send plain text message ──────────────────────────────────────────────────

/**
 * Sends a text message via Evolution API.
 *
 * @param instanceName  - Evolution API instance name
 * @param serverUrl     - Evolution API base URL (e.g. "https://evo.myserver.com")
 * @param apiKey        - Evolution API key for this instance
 * @param payload       - phone number, text content, optional delay
 */
export async function evolutionSendText(
  instanceName: string,
  serverUrl: string,
  apiKey: string,
  payload: SendTextPayload
): Promise<SendTextResult> {
  const url = `${serverUrl.replace(/\/$/, "")}/message/sendText/${instanceName}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: payload.phone,
        text: payload.text,
        delay: payload.delayMs ?? 1200,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[evolution-client] Network error sending to ${instanceName}:`, msg);
    return { ok: false, error: msg };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[evolution-client] HTTP ${response.status} from Evolution:`, body);
    return { ok: false, error: `HTTP ${response.status}` };
  }

  // Evolution API returns the sent message object including its WhatsApp ID
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  const externalId =
    (json?.key as Record<string, unknown> | undefined)?.id as string | undefined;

  return { ok: true, externalId };
}
