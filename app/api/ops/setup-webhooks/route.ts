// GET /api/ops/setup-webhooks
//
// Idempotent — fetches all Evolution API instances and sets webhooks to CRM URL.

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

export async function GET() {
  const serverUrl = (process.env.EVOLUTION_SERVER_URL ?? "").replace(/\/$/, "");
  const apiKey    = (process.env.EVOLUTION_API_KEY ?? "").trim();

  if (!serverUrl || !apiKey) {
    return NextResponse.json({ error: "EVOLUTION_SERVER_URL or EVOLUTION_API_KEY not set" }, { status: 500 });
  }

  const headers: Record<string, string> = {
    "apikey": apiKey,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  // 1. Fetch all instances
  let rawInstances: unknown[] = [];
  try {
    const res = await fetch(`${serverUrl}/instance/fetchInstances`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as unknown;
    rawInstances = Array.isArray(data) ? data : [];
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch instances", detail: String(err) }, { status: 502 });
  }

  // Evolution API v2.3.7 returns flat objects with field "name" (not "instanceName")
  // Older v1 returned {instanceName: ...} or {instance: {instanceName: ...}}
  function extractName(item: unknown): string | null {
    if (typeof item !== "object" || !item) return null;
    const obj = item as Record<string, unknown>;
    // v2.3.7 flat shape: {name: "...", id: "...", connectionStatus: ...}
    if (typeof obj.name === "string") return obj.name;
    // v2 nested: {instance: {instanceName: ...}}
    if (obj.instance && typeof obj.instance === "object") {
      const inst = obj.instance as Record<string, unknown>;
      if (typeof inst.instanceName === "string") return inst.instanceName;
      if (typeof inst.name === "string") return inst.name;
    }
    // v1 flat: {instanceName: ...}
    return typeof obj.instanceName === "string" ? obj.instanceName : null;
  }

  const results: Array<{
    instance: string;
    previousWebhook: string | null;
    action: "updated" | "already_correct" | "skipped" | "error";
    error?: string;
  }> = [];

  // 2. For each instance, check and update webhook
  for (const item of rawInstances) {
    const name = extractName(item);
    if (!name || name === "__auth_probe__") {
      continue;
    }

    // Fetch current webhook config
    let currentUrl: string | null = null;
    try {
      const res = await fetch(`${serverUrl}/webhook/find/${encodeURIComponent(name)}`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const wh = data?.webhook as Record<string, unknown> | undefined;
        currentUrl = (wh?.url as string) ?? null;
      }
    } catch {
      // ignore — will update anyway
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
          webhook: {
            url: WEBHOOK_URL,
            enabled: true,
            webhookByEvents: false,
            webhookBase64: false,
            events: WEBHOOK_EVENTS,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        results.push({ instance: name, previousWebhook: currentUrl, action: "updated" });
      } else {
        const text = await res.text();
        results.push({ instance: name, previousWebhook: currentUrl, action: "error", error: text.slice(0, 300) });
      }
    } catch (err) {
      results.push({ instance: name, previousWebhook: currentUrl, action: "error", error: String(err) });
    }
  }

  return NextResponse.json({
    webhookUrl: WEBHOOK_URL,
    instanceCount: rawInstances.length,
    processed: results.length,
    updated: results.filter((r) => r.action === "updated").length,
    alreadyCorrect: results.filter((r) => r.action === "already_correct").length,
    errors: results.filter((r) => r.action === "error").length,
    results,
    // Debug: show raw structure of first instance
    rawSample: rawInstances[0] ?? null,
  });
}
