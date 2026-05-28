// GET /api/ops/setup-webhooks
//
// One-shot endpoint that:
// 1. Fetches all Evolution API instances
// 2. Checks their current webhook configuration
// 3. Updates any instance whose webhook URL doesn't match the CRM webhook
//
// This endpoint is safe to call multiple times (idempotent).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WEBHOOK_URL = "https://flowai-crm.vercel.app/api/webhook/whatsapp";

const WEBHOOK_EVENTS = [
  "APPLICATION_STARTUP",
  "QRCODE_UPDATED",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "PRESENCE_UPDATE",
  "CHATS_SET",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_DELETE",
  "GROUPS_UPSERT",
  "GROUP_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "CONNECTION_UPDATE",
  "CALL",
  "NEW_JWT_TOKEN",
];

interface EvolutionInstance {
  instanceName: string;
  instanceId?: string;
  status?: string;
  webhookWaBusiness?: string | null;
  webhook?: {
    url?: string;
    enabled?: boolean;
    events?: string[];
  };
}

export async function GET() {
  const serverUrl = (process.env.EVOLUTION_SERVER_URL ?? "").replace(/\/$/, "");
  const apiKey    = (process.env.EVOLUTION_API_KEY ?? "").trim();

  if (!serverUrl || !apiKey) {
    return NextResponse.json({ error: "EVOLUTION_SERVER_URL or EVOLUTION_API_KEY not set" }, { status: 500 });
  }

  const headers = {
    "apikey": apiKey,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  // 1. Fetch all instances
  let instances: EvolutionInstance[] = [];
  try {
    const res = await fetch(`${serverUrl}/instance/fetchInstances`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as unknown;
    instances = Array.isArray(data) ? data as EvolutionInstance[] : [];
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch instances", detail: String(err) }, { status: 502 });
  }

  const results: Array<{
    instance: string;
    previousWebhook: string | null;
    action: "updated" | "already_correct" | "error";
    error?: string;
  }> = [];

  // 2. For each instance, fetch webhook config and update if needed
  for (const inst of instances) {
    const name = inst.instanceName;
    if (!name || name === "__auth_probe__") continue;

    // Fetch current webhook
    let currentUrl: string | null = null;
    try {
      const res = await fetch(`${serverUrl}/webhook/find/${encodeURIComponent(name)}`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = await res.json() as { webhook?: { url?: string } };
        currentUrl = data?.webhook?.url ?? null;
      }
    } catch {
      // ignore — will just update
    }

    if (currentUrl === WEBHOOK_URL) {
      results.push({ instance: name, previousWebhook: currentUrl, action: "already_correct" });
      continue;
    }

    // Update webhook
    try {
      const res = await fetch(`${serverUrl}/webhook/set/${encodeURIComponent(name)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: WEBHOOK_URL,
          enabled: true,
          webhookByEvents: false,
          webhookBase64: false,
          events: WEBHOOK_EVENTS,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        results.push({ instance: name, previousWebhook: currentUrl, action: "updated" });
      } else {
        const text = await res.text();
        results.push({ instance: name, previousWebhook: currentUrl, action: "error", error: text.slice(0, 200) });
      }
    } catch (err) {
      results.push({ instance: name, previousWebhook: currentUrl, action: "error", error: String(err) });
    }
  }

  const updated = results.filter((r) => r.action === "updated").length;
  const alreadyCorrect = results.filter((r) => r.action === "already_correct").length;
  const errors = results.filter((r) => r.action === "error").length;

  return NextResponse.json({
    webhookUrl: WEBHOOK_URL,
    instanceCount: instances.length,
    updated,
    alreadyCorrect,
    errors,
    results,
  });
}
