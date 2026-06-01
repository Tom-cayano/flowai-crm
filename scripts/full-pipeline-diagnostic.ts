#!/usr/bin/env tsx
// FlowAI CRM — Full Pipeline Diagnostic
// Usage: npx tsx scripts/full-pipeline-diagnostic.ts
//
// Checks every layer of the inbound message pipeline and reports PASS/FAIL.
// Run this whenever messages are not arriving to pinpoint the broken layer.

import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { createClient } from "@supabase/supabase-js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws") as typeof WebSocket;

// ─── Config (from env) ────────────────────────────────────────────────────────

const REDIS_URL          = process.env.REDIS_URL ?? "";
const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const EVOLUTION_URL      = process.env.EVOLUTION_SERVER_URL ?? "";
const EVOLUTION_KEY      = process.env.EVOLUTION_API_KEY ?? "";
const WEBHOOK_URL        = process.env.DIAGNOSTIC_WEBHOOK_URL
                           ?? "https://crm-whatsapp-tau.vercel.app/api/webhook/whatsapp";
const WEBHOOK_SECRET     = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME ?? "flowai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD   = "\x1b[1m";

let passed = 0;
let failed = 0;

function pass(label: string, detail = "") {
  passed++;
  console.log(`${GREEN}✓ PASS${RESET} ${BOLD}${label}${RESET}${detail ? `  ${YELLOW}${detail}${RESET}` : ""}`);
}

function fail(label: string, detail = "") {
  failed++;
  console.log(`${RED}✗ FAIL${RESET} ${BOLD}${label}${RESET}${detail ? `  — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n${BOLD}── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}${RESET}`);
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
  );
  return Promise.race([Promise.resolve(promise), timeout]).catch((err: Error) => {
    throw new Error(`[${label}] ${err.message}`);
  });
}

// ─── Layer 1: Environment variables ───────────────────────────────────────────

async function checkEnv() {
  section("Layer 1: Environment Variables");

  const vars = {
    REDIS_URL:               REDIS_URL,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
    EVOLUTION_SERVER_URL:    EVOLUTION_URL,
    EVOLUTION_API_KEY:       EVOLUTION_KEY,
  };

  for (const [key, val] of Object.entries(vars)) {
    if (val) {
      pass(key, val.length > 40 ? val.slice(0, 20) + "…" : val);
    } else {
      fail(key, "NOT SET");
    }
  }
}

// ─── Layer 2: Redis ───────────────────────────────────────────────────────────

async function checkRedis() {
  section("Layer 2: Redis (Upstash)");

  if (!REDIS_URL) { fail("Redis connection", "REDIS_URL not set"); return; }

  let redis: Redis | null = null;
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 0,
      connectTimeout: 5_000,
      lazyConnect: true,
    });
    await withTimeout(redis.ping(), 5_000, "redis ping");
    pass("Redis PING");

    // Test write + read
    const testKey = `diag:${Date.now()}`;
    await redis.set(testKey, "ok", "EX", 10);
    const val = await redis.get(testKey);
    if (val === "ok") {
      pass("Redis SET/GET");
    } else {
      fail("Redis SET/GET", `expected "ok" got ${String(val)}`);
    }
    await redis.del(testKey);
  } catch (err) {
    fail("Redis connection", err instanceof Error ? err.message : String(err));
  } finally {
    redis?.disconnect();
  }
}

// ─── Layer 3: BullMQ queue ────────────────────────────────────────────────────

async function checkBullMQ() {
  section("Layer 3: BullMQ Queue");

  if (!REDIS_URL) { fail("BullMQ", "REDIS_URL not set"); return; }

  let redis: Redis | null = null;
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 0,
      connectTimeout: 5_000,
      lazyConnect: true,
    });
    await redis.ping();

    const queue = new Queue("wpp-message", { connection: redis });
    const counts = await withTimeout(queue.getJobCounts("waiting", "active", "failed", "delayed"), 5_000, "queue counts");

    pass("BullMQ queue reachable", JSON.stringify(counts));

    if ((counts.failed ?? 0) > 10) {
      fail("BullMQ failed jobs", `${counts.failed} jobs in failed state — check DLQ`);
    } else {
      pass("BullMQ failed jobs", `${counts.failed ?? 0} failed`);
    }

    if ((counts.waiting ?? 0) > 50) {
      fail("BullMQ waiting queue", `${counts.waiting} jobs stuck — worker may be down`);
    } else {
      pass("BullMQ waiting queue", `${counts.waiting ?? 0} waiting`);
    }

    await queue.close();
  } catch (err) {
    fail("BullMQ", err instanceof Error ? err.message : String(err));
  } finally {
    redis?.disconnect();
  }
}

// ─── Layer 4: Webhook endpoint ────────────────────────────────────────────────

async function checkWebhook() {
  section("Layer 4: Webhook Endpoint");

  try {
    // GET health check
    const getRes = await withTimeout(
      fetch(WEBHOOK_URL, { method: "GET" }),
      5_000, "webhook GET"
    );
    if (getRes.ok) {
      pass("Webhook GET", `${getRes.status} ${WEBHOOK_URL}`);
    } else {
      fail("Webhook GET", `HTTP ${getRes.status}`);
    }
  } catch (err) {
    fail("Webhook GET", err instanceof Error ? err.message : String(err));
  }

  try {
    // POST with valid secret — should return {"success":true}
    const body = JSON.stringify({
      event: "MESSAGES_UPSERT",
      instance: EVOLUTION_INSTANCE,
      data: [],
    });

    const postRes = await withTimeout(
      fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": WEBHOOK_SECRET,
        },
        body,
      }),
      5_000, "webhook POST"
    );

    const text = await postRes.text();
    if (postRes.ok && text.includes("success")) {
      pass("Webhook POST (valid secret)", `${postRes.status} → ${text.slice(0, 60)}`);
    } else if (postRes.status === 401) {
      fail("Webhook POST (valid secret)", `401 Unauthorized — EVOLUTION_WEBHOOK_SECRET mismatch`);
    } else if (text.includes("Authentication") || text.includes("sso-api")) {
      fail("Webhook POST (valid secret)", "Blocked by Vercel SSO — Deployment Protection active");
    } else {
      fail("Webhook POST (valid secret)", `HTTP ${postRes.status}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    fail("Webhook POST (valid secret)", err instanceof Error ? err.message : String(err));
  }
}

// ─── Layer 5: Evolution API ───────────────────────────────────────────────────

async function checkEvolution() {
  section("Layer 5: Evolution API");

  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    fail("Evolution API", "EVOLUTION_SERVER_URL or EVOLUTION_API_KEY not set");
    return;
  }

  try {
    // Check instance state
    const res = await withTimeout(
      fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
        headers: { apikey: EVOLUTION_KEY },
      }),
      5_000, "evolution instances"
    );

    if (res.ok) {
      const data = await res.json() as Array<{ name?: string; connectionStatus?: string }>;
      const instance = data.find((i) => i.name === EVOLUTION_INSTANCE);
      if (instance) {
        const state = instance.connectionStatus ?? "unknown";
        if (state === "open") {
          pass("Evolution instance state", `${EVOLUTION_INSTANCE} → open (connected)`);
        } else {
          fail("Evolution instance state", `${EVOLUTION_INSTANCE} → ${state} (NOT open — messages may be lost)`);
        }
      } else {
        fail("Evolution instance", `Instance "${EVOLUTION_INSTANCE}" not found in ${data.map((i) => i.name).join(", ")}`);
      }
    } else {
      fail("Evolution API reachable", `HTTP ${res.status}`);
    }
  } catch (err) {
    fail("Evolution API reachable", err instanceof Error ? err.message : String(err));
  }

  try {
    // Check webhook config
    const res = await withTimeout(
      fetch(`${EVOLUTION_URL}/webhook/find/${EVOLUTION_INSTANCE}`, {
        headers: { apikey: EVOLUTION_KEY },
      }),
      5_000, "evolution webhook"
    );

    if (res.ok) {
      const cfg = await res.json() as { url?: string; enabled?: boolean; events?: string[] };
      if (cfg.enabled && cfg.url) {
        pass("Evolution webhook enabled", cfg.url);
        if (!cfg.url.includes("flowaicrm.com") && !cfg.url.includes("vercel.app")) {
          fail("Evolution webhook URL", `Unexpected URL: ${cfg.url}`);
        } else {
          pass("Evolution webhook URL", cfg.url);
        }
        const hasUpsert = cfg.events?.includes("MESSAGES_UPSERT");
        if (hasUpsert) {
          pass("Evolution webhook events", "MESSAGES_UPSERT ✓");
        } else {
          fail("Evolution webhook events", `MESSAGES_UPSERT missing — events: ${cfg.events?.join(", ")}`);
        }
      } else {
        fail("Evolution webhook enabled", `enabled=${String(cfg.enabled)}, url=${cfg.url ?? "(none)"}`);
      }
    } else {
      fail("Evolution webhook config", `HTTP ${res.status}`);
    }
  } catch (err) {
    fail("Evolution webhook config", err instanceof Error ? err.message : String(err));
  }
}

// ─── Layer 6: Supabase DB ─────────────────────────────────────────────────────

async function checkSupabase() {
  section("Layer 6: Supabase Database");

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fail("Supabase", "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
    return;
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

  try {
    // Basic connectivity: count conversations
    const { count, error } = await withTimeout(
      db.from("conversations").select("*", { count: "exact", head: true }),
      5_000, "supabase conversations"
    );
    if (error) {
      fail("Supabase conversations table", error.message);
    } else {
      pass("Supabase conversations table", `${count ?? "?"} rows`);
    }
  } catch (err) {
    fail("Supabase connection", err instanceof Error ? err.message : String(err));
  }

  try {
    // Check messages table
    const { count, error } = await withTimeout(
      db.from("messages").select("*", { count: "exact", head: true }),
      5_000, "supabase messages"
    );
    if (error) {
      fail("Supabase messages table", error.message);
    } else {
      pass("Supabase messages table", `${count ?? "?"} rows`);
    }
  } catch (err) {
    fail("Supabase messages table", err instanceof Error ? err.message : String(err));
  }

  try {
    // Check whatsapp_instances
    const { data, error } = await withTimeout(
      db.from("whatsapp_instances").select("id, instance_name, connection_state").limit(5),
      5_000, "supabase instances"
    );
    if (error) {
      fail("Supabase whatsapp_instances", error.message);
    } else {
      const rows = (data ?? []) as Array<{ id: string; instance_name: string; connection_state: string }>;
      const open = rows.filter((i) => i.connection_state === "open");
      if (open.length > 0) {
        pass("Supabase whatsapp_instances", `${open.length} open: ${open.map((i) => i.instance_name).join(", ")}`);
      } else {
        fail("Supabase whatsapp_instances", `No open instances — ${rows.length} total`);
      }
    }
  } catch (err) {
    fail("Supabase whatsapp_instances", err instanceof Error ? err.message : String(err));
  }

  try {
    // Check worker heartbeat (is the Railway worker alive?)
    const cutoff = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 min ago
    const { data, error } = await withTimeout(
      db.from("worker_heartbeats").select("worker_id, last_beat, version").gte("last_beat", cutoff),
      5_000, "supabase worker heartbeat"
    );
    if (error) {
      fail("Worker heartbeat", error.message);
    } else {
      const rows = (data ?? []) as Array<{ worker_id: string; last_beat: string; version: string }>;
      if (rows.length > 0) {
        pass("Worker heartbeat (Railway alive)", `last beat: ${rows[0].last_beat} | v${rows[0].version}`);
      } else {
        fail("Worker heartbeat", "No heartbeat in last 5 min — Railway worker may be down");
      }
    }
  } catch (err) {
    fail("Worker heartbeat", err instanceof Error ? err.message : String(err));
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}FlowAI CRM — Full Pipeline Diagnostic${RESET}`);
  console.log(`${new Date().toISOString()}\n`);

  await checkEnv();
  await checkRedis();
  await checkBullMQ();
  await checkWebhook();
  await checkEvolution();
  await checkSupabase();

  const total = passed + failed;
  console.log(`\n${"─".repeat(56)}`);
  console.log(`${BOLD}Result: ${GREEN}${passed} passed${RESET}  ${RED}${failed} failed${RESET}  (${total} total)`);

  if (failed === 0) {
    console.log(`\n${GREEN}${BOLD}All layers healthy. Pipeline is operational.${RESET}`);
  } else {
    console.log(`\n${RED}${BOLD}${failed} layer(s) failing. Fix the FAIL items above.${RESET}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Diagnostic crashed:", err);
  process.exit(2);
});
